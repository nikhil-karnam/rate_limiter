#!/bin/bash
cd ~/rate_limiter

for port in 6379 6380 6381; do
  redis-server --port $port --daemonize yes
done

for port in 3000 3001 3002; do
  PORT=$port setsid -f node dist/main < /dev/null
done
for port in 3000 3001 3002; do
  until curl -s -o /dev/null http://localhost:$port/health; do sleep 0.2; done
done

setsid -f envoy -c envoy.yaml < /dev/null
until curl -s -o /dev/null http://localhost:8080/health; do sleep 0.2; done
