#!/usr/bin/env bash
set -euo pipefail

echo "Setting up kashyap_user and kashyap_db..."

su - postgres -c "psql" << 'EOF'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'kashyap_user') THEN
    CREATE USER kashyap_user WITH PASSWORD 'kashyap_secure_dev_password';
  ELSE
    ALTER USER kashyap_user WITH PASSWORD 'kashyap_secure_dev_password';
  END IF;
END
$$;

SELECT 'user_ready' AS status;
EOF

su - postgres -c "psql" << 'EOF'
SELECT 'CREATE DATABASE kashyap_db OWNER kashyap_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kashyap_db')\gexec

GRANT ALL PRIVILEGES ON DATABASE kashyap_db TO kashyap_user;
ALTER DATABASE kashyap_db OWNER TO kashyap_user;
EOF

echo "Verifying database connection..."
PGPASSWORD=kashyap_secure_dev_password psql -h localhost -U kashyap_user -d kashyap_db -c "SELECT current_database(), current_user;"

echo "Setup completed successfully."
