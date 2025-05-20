const express = require('express');
const router = express.Router();
const {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Debug: Log the imported controllers
console.log('[userRoutes.js] Imported controllers:', {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser
});

// All routes here are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

router.route('/')
    .post(createUser)
    .get(getAllUsers);

router.route('/:id')
    .get(getUserById)
    .put(updateUser)
    .delete(deleteUser);

module.exports = router;