// Common specializations offered as one-tap choices. Not a closed list: a
// doctor whose specialty is missing picks "Other" and types it (stored as
// free text in doctor_profiles.specialization, VARCHAR(150)).
export const SPECIALIZATIONS = [
  'General Practice', 'Family Medicine', 'Internal Medicine', 'Anaesthesiology',
  'Cardiology', 'Cardiothoracic Surgery', 'Dermatology', 'Emergency Medicine',
  'Endocrinology', 'ENT (Otorhinolaryngology)', 'Gastroenterology', 'General Surgery',
  'Geriatrics', 'Gynaecology & Obstetrics', 'Haematology', 'Infectious Diseases',
  'Nephrology', 'Neurology', 'Neurosurgery', 'Oncology', 'Ophthalmology',
  'Orthopaedics', 'Paediatrics', 'Pathology', 'Plastic Surgery', 'Psychiatry',
  'Pulmonology', 'Radiology', 'Rheumatology', 'Sports Medicine', 'Urology',
  'Venereology', 'Dental Surgery',
];

export const OTHER_SPECIALIZATION = '__other__';
