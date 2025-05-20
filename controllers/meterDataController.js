// backend/controllers/meterDataController.js
const Device = require('../models/Device');
const SMSLog = require('../models/SMSLog');
const UsageReading = require('../models/UsageReading');

// --- Meter Data Parsing Function ---
const parseMeterDataString = (dataString) => {
    const parsedData = {
        meterId: null,
        updates: {},
        newVolumeReading: null,
        log: {
            rawCommand: dataString,
            commandType: 'DATA_UPLOAD',
            status: 'pending_parse',
            response: 'Data received.',
            parameters: {}
        }
    };

    try {
        const parts = dataString.trim().split(';');
        parts.forEach(part => {
            if (!part.includes(':')) return;
            const [key, value] = part.split(':');
            const k = key.trim().toUpperCase();
            const v = value.trim();
            parsedData.log.parameters[k] = v;

            switch (k) {
                case 'MTRID':
                    parsedData.meterId = v;
                    parsedData.log.meterId = v;
                    break;
                case 'VOL':
                    const volume = parseFloat(v);
                    if (!isNaN(volume)) {
                        parsedData.updates.currentVolume = volume;
                        parsedData.newVolumeReading = volume;
                    }
                    break;
                case 'BATT':
                    parsedData.updates.batteryVoltage = v;
                    break;
                case 'SIG':
                    parsedData.updates.networkStrength = v;
                    break;
                // Extend with additional meter fields as needed
            }
        });

        if (!parsedData.meterId) {
            parsedData.log.status = 'parse_error';
            parsedData.log.response = 'Meter ID not found in data string.';
            console.warn('[MeterDataController] Parse Error: Meter ID missing.', dataString);
        } else if (Object.keys(parsedData.updates).length === 0) {
            parsedData.log.status = 'parse_info';
            parsedData.log.response = 'No updatable data fields found, but Meter ID present.';
            console.info('[MeterDataController] Parse Info: No specific data fields parsed for update, but MTRID found.', dataString);
        } else {
            parsedData.log.status = 'parsed_ok';
        }

    } catch (error) {
        parsedData.log.status = 'parse_exception';
        parsedData.log.response = `Exception during parsing: ${error.message}`;
        console.error('[MeterDataController] Exception during parsing data string:', dataString, error);
    }

    return parsedData;
};

// --- Main Request Handler ---
const processIncomingMeterData = async (req, res) => {
    let dataString = '';
    const contentType = req.get('Content-Type');
    console.log(`[MeterDataController] Received ingress request. Content-Type: ${contentType}`);
    console.log(`[MeterDataController] Request Body:`, req.body);

    if (typeof req.body === 'string') {
        dataString = req.body;
    } else if (req.body?.message && typeof req.body.message === 'string') {
        dataString = req.body.message;
    } else if (req.body?.text && typeof req.body.text === 'string') {
        dataString = req.body.text;
    } else if (req.body && Object.keys(req.body).length > 0) {
        dataString = JSON.stringify(req.body);
        console.warn('[MeterDataController] Received complex object, using stringified body:', dataString);
    }

    if (!dataString) {
        console.warn('[MeterDataController] No usable data string found in request.');
        return res.status(400).send('No data string received.');
    }

    console.log(`[MeterDataController] Processing data string: "${dataString}"`);
    const { meterId, updates, newVolumeReading, log: logData } = parseMeterDataString(dataString);

    if (!meterId) {
        if (logData) await SMSLog.create(logData);
        return res.status(400).send(logData.response || 'Invalid data: Meter ID could not be parsed.');
    }

    try {
        const device = await Device.findOne({ meterId });
        if (!device) {
            logData.status = 'device_not_found';
            logData.response = `Device with Meter ID ${meterId} not registered in system.`;
            console.warn(`[MeterDataController] ${logData.response}`);
            if (logData) await SMSLog.create(logData);
            return res.status(404).send(logData.response);
        }

        // Save new usage reading if applicable
        if (newVolumeReading !== null && newVolumeReading !== undefined) {
            const usageReading = new UsageReading({
                deviceId: device._id,
                meterId: device.meterId,
                timestamp: new Date(),
                volumeReading: newVolumeReading,
                source: 'meter_ingress'
            });
            await usageReading.save();
            console.log(`[MeterDataController] Saved new UsageReading for ${meterId}: ${newVolumeReading}`);
        }

        if (Object.keys(updates).length > 0) {
            Object.assign(device, updates);
            device.lastSeen = Date.now();
            await device.save();
            logData.status = 'success_updated';
            logData.response = `Device ${meterId} updated successfully.`;
            console.log(`[MeterDataController] Device ${meterId} updated with:`, updates);
        } else {
            device.lastSeen = Date.now();
            await device.save();
            logData.status = 'success_ping';
            logData.response = `Device ${meterId} acknowledged (ping or no new data).`;
            console.log(`[MeterDataController] Device ${meterId} acknowledged.`);
        }

        if (logData) await SMSLog.create(logData);
        res.status(200).send(logData.response);

    } catch (error) {
        logData.status = 'db_error';
        logData.response = `Error processing data for ${meterId}: ${error.message}`;
        console.error(`[MeterDataController] Database or processing error for ${meterId}:`, error);
        if (logData) await SMSLog.create(logData);
        res.status(500).send(logData.response);
    }
};

module.exports = {
    processIncomingMeterData
};
