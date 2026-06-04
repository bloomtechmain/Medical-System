// No database changes needed for lab assignment.
// When a doctor assigns a lab during consultation creation, a lab_requests record
// is created directly (via consultationController.create). The link is tracked
// via lab_requests.consultation_id — no extra column on medical_consultations required.
export {};
