---
type: BigQuery Table
title: Orders
description: One row per customer order.
resource: https://console.cloud.google.com/bigquery?p=acme&d=sales&t=orders
tags: [sales, orders]
generated:
  by: reference_agent/gemini-2.5-pro
  at: '2026-07-10T21:15:20+00:00'
verified:
  - { by: human:jdoe, at: '2026-07-12T09:00:00Z' }
status: stable
stale_after: 2026-12-31
sources:
  - id: orders-ddl
    resource: https://example.com/orders-ddl
    title: Orders DDL
    author: team:data-platform
    last_modified: 2026-06-15
  - id: revenue
    resource: computations/revenue.md
    title: Revenue computation
---

# Schema

One row per `order_id`. See [revenue](../computations/revenue.md) and
[run-on-bq](../skills/run-on-bq.md).
