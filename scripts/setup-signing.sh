#!/usr/bin/env bash
# 一次性:在登录钥匙串里创建自签名代码签名证书「Baner Local Signing」。
# 所有构建都用它签名,签名身份保持稳定,更新后读取钥匙串不再弹窗(ADR-0006)。
set -euo pipefail
NAME="Baner Local Signing"
KC="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -p codesigning "$KC" | grep -q "\"$NAME\""; then
  echo "✓ 已存在签名身份: $NAME"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/cfg" <<CFG
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
CFG
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" -config "$TMP/cfg" 2>/dev/null
P12PASS="baner-local"
/usr/bin/openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -name "$NAME" -out "$TMP/id.p12" -passout "pass:$P12PASS" 2>/dev/null
security import "$TMP/id.p12" -k "$KC" -P "$P12PASS" -T /usr/bin/codesign >/dev/null
echo "✓ 已创建签名身份: $NAME"
security find-identity -p codesigning "$KC" | grep "$NAME"
