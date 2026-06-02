const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const {
  createRequest, respond, getAll, getPatientView, searchPatients,
} = require('../controllers/accessRequestController');

router.get('/search-patients',          protect, authorize('doctor'), searchPatients);
router.get('/patient/:patientId/view',  protect, authorize('doctor'), getPatientView);
router.get('/',                         protect, authorize('doctor', 'patient'), getAll);
router.post('/',                        protect, authorize('doctor'), createRequest);
router.patch('/:id/respond',            protect, authorize('patient'), respond);

module.exports = router;
