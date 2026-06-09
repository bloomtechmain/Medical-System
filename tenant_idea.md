---
  The Core Rule

  ▎ Tenant schemas are created for ORGANISATIONS — not for individual users.

  A patient registering, a doctor registering, a pharmacist registering — none of these create a tenant schema. Only an organisation being provisioned creates a tenant
  schema.

  ---
  Patient Registration

  Patient fills in: name, email, password
                          |
                          v
      INSERT INTO public.users (role = 'patient')
      INSERT INTO clinical.patient_profiles (DOB, blood type, etc.)
                          |
                          v
             NO tenant schema created.
             Patients are people, not organisations.

  Patient gets zero rows in public.organizations and zero tenant schemas. Their health data lives in the shared clinical schema, protected by RLS.

  ---
  Hospital Registration

  A hospital is an organisation, not a person. So two things happen — in order:

  Step 1: Hospital registers as an organisation
          (admin creates it, or hospital fills a registration form)
                          |
                          v
          public.provision_tenant('nawaloka', 'Nawaloka Hospital', 'hospital')
                          |
             This function does THREE things instantly:
             1. INSERT INTO public.organizations (slug, name, org_type, schema_name)
             2. CREATE SCHEMA tenant_nawaloka
             3. CREATE ROLE tn_nawaloka  (isolated DB role)
                          |
                          v
             Tenant schema EXISTS from this moment.

  Step 2: Doctors who work at that hospital register as users
          INSERT INTO public.users (role = 'doctor')
          INSERT INTO public.doctor_profiles (...)
          INSERT INTO public.organization_members
            (organization_id = nawaloka.id, user_id = doctor.id, member_role = 'doctor')

  The tenant schema is created the moment the hospital organisation is provisioned — not when a doctor registers.

  ---
  Pharmacy Registration

  Same pattern as hospital, but the provision_tenant function also creates operational tables inside the tenant schema automatically:

  public.provision_tenant('healthcare_pharmacy', 'HealthCare Pharmacy', 'pharmacy')
                          |
             Does FIVE things instantly:
             1. INSERT INTO public.organizations
             2. CREATE SCHEMA tenant_healthcare_pharmacy
             3. CREATE ROLE tn_healthcare_pharmacy
             4. CREATE TABLE tenant_healthcare_pharmacy.orders
                CREATE TABLE tenant_healthcare_pharmacy.order_items
                CREATE TABLE tenant_healthcare_pharmacy.sales
                CREATE TABLE tenant_healthcare_pharmacy.sale_items
             5. GRANT access to corehealth_app role

  For pharmacy, the tenant schema is fully operational immediately — the orders and sales tables exist from the moment of provisioning. Hospital and lab schemas are
  reserved (empty) until you add tables later.

  ---
  Laboratory Registration

  Same as hospital — schema is created but empty (reserved for future tables):

  public.provision_tenant('city_medical_lab', 'City Medical Laboratory', 'laboratory')
             1. INSERT INTO public.organizations
             2. CREATE SCHEMA tenant_city_medical_lab
             3. CREATE ROLE tn_city_medical_lab
             (no special tables — lab test data lives in clinical.lab_requests)

  The lab's actual test data (reports, results) goes into clinical.lab_requests — the shared clinical schema — not the tenant schema. The tenant schema is reserved for
  future lab-specific operational data.

  ---
  Doctor's Personal Clinic Registration

  public.provision_tenant('janaka_clinic', 'Janaka Medical Centre', 'clinic', 2)
                                                                               ^
                                                                      doctor's user_id
             1. INSERT INTO public.organizations (owner_user_id = 2)
             2. CREATE SCHEMA tenant_janaka_clinic
             3. CREATE ROLE tn_janaka_clinic
             (no special tables — clinic consults go into clinical schema)

  The doctor must already exist in public.users before their clinic can be provisioned.

  ---
  Summary Table

  ┌────────────────────────────────┬─────────────────────┬────────────────────────┬─────────────────────────────────────────┐
  │         Who registers          │ Creates a user row? │ Creates tenant schema? │         When is schema created?         │
  ├────────────────────────────────┼─────────────────────┼────────────────────────┼─────────────────────────────────────────┤
  │ Patient                        │ Yes                 │ No                     │ Never                                   │
  ├────────────────────────────────┼─────────────────────┼────────────────────────┼─────────────────────────────────────────┤
  │ Doctor                         │ Yes                 │ No                     │ Never (doctor is a person)              │
  ├────────────────────────────────┼─────────────────────┼────────────────────────┼─────────────────────────────────────────┤
  │ Pharmacist (person)            │ Yes                 │ No                     │ Never (person, not org)                 │
  ├────────────────────────────────┼─────────────────────┼────────────────────────┼─────────────────────────────────────────┤
  │ Lab technician (person)        │ Yes                 │ No                     │ Never                                   │
  ├────────────────────────────────┼─────────────────────┼────────────────────────┼─────────────────────────────────────────┤
  │ Hospital (org)                 │ No                  │ Yes                    │ The moment provision_tenant() is called │
  ├────────────────────────────────┼─────────────────────┼────────────────────────┼─────────────────────────────────────────┤
  │ Pharmacy (org)                 │ No                  │ Yes                    │ The moment provision_tenant() is called │
  ├────────────────────────────────┼─────────────────────┼────────────────────────┼─────────────────────────────────────────┤
  │ Laboratory (org)               │ No                  │ Yes                    │ The moment provision_tenant() is called │
  ├────────────────────────────────┼─────────────────────┼────────────────────────┼─────────────────────────────────────────┤
  │ Doctor's personal clinic (org) │ No                  │ Yes                    │ The moment provision_tenant() is called │
  └────────────────────────────────┴─────────────────────┴────────────────────────┴─────────────────────────────────────────┘

  ---
  Who Calls provision_tenant()?

  In the current seed file it is called manually by running the SQL. In a real system you have two options:

  Option A — Admin-only provisioning (simpler, safer)
  Hospital submits a registration request form
              |
              v
  Admin reviews and approves in the admin panel
              |
              v
  Admin panel calls provision_tenant() via backend API
              |
              v
  Tenant schema created, hospital is active

  Option B — Self-registration with auto-provisioning
  Hospital fills in organisation registration form
  (name, type, slug, contact details)
              |
              v
  Backend validates → calls provision_tenant() automatically
              |
              v
  Tenant schema created immediately, hospital can start adding staff

  Option A is recommended to start with — it prevents rogue organisations from being provisioned and tenant schemas from being created without oversight.

  ---
  The Simple Way to Remember It

  - A person registers → only a row in public.users. No schema, no org.
  - An organisation is provisioned → a schema is born. This is done by an admin or a registration flow, not by an individual person signing up.
  - A pharmacist registering does NOT create the pharmacy's tenant schema. The pharmacy organisation being provisioned creates it. The pharmacist is then linked to that
  existing pharmacy.

  Side-by-Side Summary Straight from the Files

  ┌───────────────────────────┬─────────────────┬──────────────────────────┬──────────────────────────────────┬────────────────────────────────────────┐
  │            Who            │ Section in seed │ provision_tenant called? │      Tenant schema created?      │         Tables inside schema?          │
  ├───────────────────────────┼─────────────────┼──────────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
  │ Patient (Saman, Priya...) │ 8.1 + 8.6       │ No                       │ No                               │ —                                      │
  ├───────────────────────────┼─────────────────┼──────────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
  │ Doctor (person)           │ 8.1 + 8.2       │ No                       │ No                               │ —                                      │
  ├───────────────────────────┼─────────────────┼──────────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
  │ Pharmacist (person)       │ 8.1 + 8.2       │ No                       │ No                               │ —                                      │
  ├───────────────────────────┼─────────────────┼──────────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
  │ Lab user (person)         │ 8.1 + 8.2       │ No                       │ No                               │ —                                      │
  ├───────────────────────────┼─────────────────┼──────────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
  │ Hospital (org)            │ 8.4             │ Yes                      │ Yes — tenant_nawaloka            │ Empty (reserved)                       │
  ├───────────────────────────┼─────────────────┼──────────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
  │ Pharmacy (org)            │ 8.4             │ Yes                      │ Yes — tenant_healthcare_pharmacy │ orders, order_items, sales, sale_items │
  ├───────────────────────────┼─────────────────┼──────────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
  │ Laboratory (org)          │ 8.4             │ Yes                      │ Yes — tenant_city_medical_lab    │ Empty (reserved)                       │
  ├───────────────────────────┼─────────────────┼──────────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
  │ Doctor's clinic (org)     │ 8.4             │ Yes                      │ Yes — tenant_janaka_clinic       │ Empty (reserved)                       │
  └───────────────────────────┴─────────────────┴──────────────────────────┴──────────────────────────────────┴────────────────────────────────────────┘