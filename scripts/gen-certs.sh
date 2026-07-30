#!/usr/bin/env bash
# Generate a local CA + server + client certs for mTLS testing.
set -euo pipefail
mkdir -p certs
cd certs

openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
  -subj "/CN=mi-server-ca"

openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/CN=localhost"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 825 -sha256

openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr -subj "/CN=mi-client"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days 825 -sha256

rm -f server.csr client.csr ca.srl
echo "Certs written to ./certs"
