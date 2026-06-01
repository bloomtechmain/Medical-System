const router = require('express').Router();
const { getAll, getOne, update, toggleActive, remove, getStats, searchPatients, searchPharmacists, searchLaboratories } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

router.get('/stats',        protect, authorize('admin'),            getStats);
router.get('/patients',     protect, authorize('admin', 'doctor'),  searchPatients);
router.get('/pharmacists',   protect, authorize('admin', 'doctor'),  searchPharmacists);
router.get('/laboratories', protect, authorize('admin', 'doctor'),  searchLaboratories);

router.use(protect, authorize('admin'));
router.get('/', getAll);
router.get('/:id', getOne);
router.put('/:id', update);
router.patch('/:id/toggle', toggleActive);
router.delete('/:id', remove);

module.exports = router;
