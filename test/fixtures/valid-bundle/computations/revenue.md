---
type: Attested Computation
title: Revenue for a fiscal year
description: Recognized revenue for a fiscal year.
tags: [finance, revenue]
status: stable
runtime: bigquery
parameters:
  - { name: year, type: integer, required: true }
executor:
  resource: skills/run-on-bq.md
  receipt: [job_id, executed_sql, result]
attester:
  resource: attesters/sql_equality.py
generated: { by: reference_agent/gemini-2.5-pro, at: '2026-07-10T21:15:20+00:00' }
verified: { by: human:jdoe, at: '2026-07-12T09:00:00Z' }
stale_after: 2026-09-23
sources:
  - id: policy
    resource: https://wiki.acme/finance/revenue-recognition
    title: Revenue recognition policy
---

# Computation

    SELECT SUM(amount) FROM orders WHERE fiscal_year = @year
