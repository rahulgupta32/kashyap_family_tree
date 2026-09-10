import os
import sys
import csv

WORKSPACE_ROOT = r"D:\Jyphra\kashyap_family_tree"
REQ_CSV = os.path.join(WORKSPACE_ROOT, "docs", "execution", "REQUIREMENTS_TRACEABILITY.csv")
EC_CSV = os.path.join(WORKSPACE_ROOT, "docs", "execution", "EDGE_CASE_TRACEABILITY.csv")

def validate_csv(csv_path, id_col, code_col, test_col, status_col, evidence_col, type_col=None):
    print(f"\n========================================================")
    print(f"Validating: {os.path.basename(csv_path)}")
    print(f"========================================================")
    
    if not os.path.exists(csv_path):
        print(f"ERROR: File not found {csv_path}")
        return False
        
    ids = set()
    duplicate_ids = []
    missing_code_files = []
    missing_test_files = []
    unverified_claims = []
    status_counts = {}
    type_counts = {}
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        row_count = 0
        for row in reader:
            row_count += 1
            row_id = row[id_col].strip()
            status = row[status_col].strip()
            evidence = row[evidence_col].strip()
            code_files_str = row[code_col].strip()
            test_files_str = row[test_col].strip()
            
            # Count status
            status_counts[status] = status_counts.get(status, 0) + 1
            
            # Count type if present
            if type_col and type_col in row:
                rec_type = row[type_col].strip()
                type_counts[rec_type] = type_counts.get(rec_type, 0) + 1
                
            # Check duplicate ID
            if row_id in ids:
                duplicate_ids.append(row_id)
            ids.add(row_id)
            
            # Check code files exist
            if status in ['VERIFIED', 'IMPLEMENTED_UNVERIFIED']:
                for cf in [c.strip() for c in code_files_str.split(',') if c.strip()]:
                    cf_path = os.path.join(WORKSPACE_ROOT, cf)
                    if not os.path.exists(cf_path):
                        missing_code_files.append((row_id, cf))
                        
                for tf in [t.strip() for t in test_files_str.split(',') if t.strip()]:
                    tf_path = os.path.join(WORKSPACE_ROOT, tf)
                    if not os.path.exists(tf_path):
                        missing_test_files.append((row_id, tf))
                        
            # Check VERIFIED evidence rigor
            if status == 'VERIFIED':
                if not evidence or 'generic' in evidence.lower() or len(evidence) < 15 or 'PASS:' not in evidence:
                    unverified_claims.append((row_id, evidence))
                    
    print(f"Total Rows Evaluated: {row_count}")
    print(f"Unique IDs: {len(ids)}")
    print(f"Duplicate IDs: {len(duplicate_ids)} {duplicate_ids if duplicate_ids else '(None)'}")
    print(f"Missing Code Files on Disk: {len(missing_code_files)} {missing_code_files[:5] if missing_code_files else '(None)'}")
    print(f"Missing Test Files on Disk: {len(missing_test_files)} {missing_test_files[:5] if missing_test_files else '(None)'}")
    print(f"Unsupported VERIFIED Claims: {len(unverified_claims)} {unverified_claims[:5] if unverified_claims else '(None)'}")
    
    print("\nCounts by Status:")
    for s, c in sorted(status_counts.items()):
        print(f"  - {s}: {c}")
        
    if type_counts:
        print("\nCounts by Record Type:")
        for t, c in sorted(type_counts.items()):
            print(f"  - {t}: {c}")
            
    is_valid = len(duplicate_ids) == 0 and len(missing_code_files) == 0 and len(missing_test_files) == 0 and len(unverified_claims) == 0
    print(f"\nValidation Result: {'PASSED' if is_valid else 'FAILED'}")
    return is_valid

print("Starting Traceability Register Validation...")
req_valid = validate_csv(REQ_CSV, 'Requirement ID', 'Implementation Code Files', 'Acceptance Test File', 'Status', 'Verification Evidence (Commit: 4bac6fa)', 'Record Type')
ec_valid = validate_csv(EC_CSV, 'Edge Case ID', 'Implementation Code Files', 'Acceptance Test File', 'Status', 'Verification Evidence (Commit: 4bac6fa)')

if req_valid and ec_valid:
    print("\nALL TRACEABILITY REGISTERS VALIDATED WITH 100% INTEGRITY!")
else:
    sys.exit(1)
