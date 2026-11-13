#!/bin/bash
pkill -x envoy
pkill -f "node dist/main"

for port in 6379 6380 6381; do
  redis-cli -p $port shutdown
done
