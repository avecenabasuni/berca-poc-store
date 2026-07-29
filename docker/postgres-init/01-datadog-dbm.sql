-- Datadog Database Monitoring (DBM) Setup Script
-- Authoritative Datadog PostgreSQL Integration Setup (via Context7)

CREATE USER datadog WITH PASSWORD 'datadog';
GRANT pg_monitor TO datadog;
GRANT SELECT ON pg_stat_database TO datadog;

CREATE SCHEMA IF NOT EXISTS datadog;
GRANT USAGE ON SCHEMA datadog TO datadog;
GRANT USAGE ON SCHEMA public TO datadog;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Function for Datadog DBM Execution Plan (EXPLAIN) collection
CREATE OR REPLACE FUNCTION datadog.explain_statement(
   l_query TEXT,
   OUT explain JSON
)
RETURNS SETOF JSON AS
$$
DECLARE
curs REFCURSOR;
plan JSON;
BEGIN
   OPEN curs FOR EXECUTE pg_catalog.concat('EXPLAIN (FORMAT JSON) ', l_query);
   FETCH curs INTO plan;
   CLOSE curs;
   RETURN QUERY SELECT plan;
END;
$$
LANGUAGE 'plpgsql'
RETURNS NULL ON NULL INPUT
SECURITY DEFINER;
