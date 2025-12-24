# Prisma Seed Import Script

## File Location
`/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/prisma/seed-import.ts`

## Purpose
Imports parsed family and student data from JSON files into the database using Prisma ORM.

## Data Sources
The script reads from these temporary files:
- `/tmp/families.json` - 46 family records
- `/tmp/students.json` - 47 student records

## What It Does

### 1. Tenant Setup
Creates or verifies demo tenant with ID `DEMO_TENANT_ID`

### 2. Fee Structures
Creates 5 fee structures (all FULL_DAY type):
- **Ducks** - R2,000/month (200000 cents)
- **Elephants** - R2,200/month (220000 cents)
- **Leavers** - R2,500/month (250000 cents)
- **Grade R** - R2,800/month (280000 cents)
- **Grade RR** - R2,600/month (260000 cents)

### 3. Parent Records
- Extracts primary parent from each family
- Parses names (removes titles like Mr/Mrs/Ms)
- Uses email as unique identifier (falls back to `family{code}@demo.local`)
- Sets preferred contact based on email availability
- Links to tenant via `DEMO_TENANT_ID`

### 4. Child Records
- Parses student names in "Surname Firstname" format
- Maps to parent via `familyCode`
- Estimates date of birth:
  - Grade classes: 5 years before admission
  - Other classes: 3 years before admission
- Maps gender to enum (MALE, FEMALE, OTHER)
- Sets `isActive` based on status (Current/Left)

### 5. Enrollments
- Creates enrollments ONLY for "Current" students
- Links child to appropriate fee structure based on className
- Uses admission date as enrollment start date
- Sets status to ACTIVE

## Key Features

### Idempotent Design
- Uses `findFirst` + conditional create/update pattern
- Safe to run multiple times
- Updates existing records instead of erroring

### Error Handling
- Validates file existence and JSON parsing
- Validates dates before insertion
- Skips invalid records with warnings
- Tracks created/updated/skipped counts

### Data Mapping
| Source Field | Target Field | Notes |
|-------------|-------------|-------|
| `family.parents[0].name` | `parent.firstName/lastName` | Parsed, title removed |
| `family.parents[0].email` | `parent.email` | Unique constraint |
| `family.parents[0].mobile` | `parent.phone/whatsapp` | Same value |
| `student.name` | `child.firstName/lastName` | "Surname Firstname" format |
| `student.gender` | `child.gender` | Mapped to enum |
| `student.className` | `enrollment.feeStructureId` | Via class→fee mapping |
| `student.admissionDate` | `enrollment.startDate` | ISO date parsed |

## Running the Script

### Prerequisites
1. Database must be running and accessible
2. Prisma schema must be migrated
3. Data files must exist at `/tmp/families.json` and `/tmp/students.json`

### Execute
```bash
cd apps/api
npx tsx prisma/seed-import.ts
```

### Expected Output
```
🌱 Starting data import from parsed JSON files...

📂 Reading data files...
✅ Loaded 46 families and 47 students

📋 Ensuring demo tenant exists...
✅ Tenant: Demo Creche (DEMO_TENANT_ID)

💰 Creating fee structures...
✅ Created 5 fee structures

👨‍👩‍👧‍👦 Importing 46 families...
✅ Parents: X created, Y updated

👶 Importing 47 students...
✅ Children: X created, Y updated
✅ Enrollments: 30 created

✨ Import completed successfully!
```

## Database Impact

### Expected Counts
- **Tenants**: 1 (demo)
- **Fee Structures**: 5
- **Parents**: 46 (one per family)
- **Children**: 47 (all students)
- **Enrollments**: ~30 (only "Current" status students)

### Data Integrity
- All foreign key constraints satisfied
- UUIDs generated using `crypto.randomUUID()`
- Money stored in cents (integer)
- Dates stored as proper Date objects
- Enums validated against schema

## Known Limitations

1. **Simplified Parent Structure**: Uses only first parent from each family
2. **Estimated Birth Dates**: Ages are approximated based on class level
3. **No Historical Enrollments**: Left students don't get enrollment records
4. **Demo Tenant Only**: All data goes to single `DEMO_TENANT_ID` tenant
5. **Class Parsing**: Assumes "ClassName/Section" format (e.g., "Ducks/A")

## Next Steps

After running this script successfully:
1. Verify data in database: `psql -d crechebooks -c "SELECT COUNT(*) FROM parents;"`
2. Update `DEMO_TENANT_ID` with real tenant UUID if needed
3. Run data validation queries to ensure correctness
4. Consider creating enrollments for historical students if needed
5. Add additional parent contacts from `family.parents` array

## Error Recovery

If the script fails:
1. Check error message for specific failure reason
2. Verify JSON files exist and are valid
3. Ensure database connection is working
4. Check Prisma schema matches expectations
5. Script is idempotent - safe to re-run after fixes

## TypeScript Compilation

The script compiles successfully with:
```bash
cd apps/api
npx tsc --noEmit --skipLibCheck prisma/seed-import.ts
```

All types are properly imported from `@prisma/client` and TypeScript built-ins.
