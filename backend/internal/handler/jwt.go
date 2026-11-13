package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"time"
)

// JWTClaims defines payload for token authentication
type JWTClaims struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	PartnerID string `json:"partner_id,omitempty"`
	Exp       int64  `json:"exp"`
}

// getJWTSecret returns the configured HMAC signing secret. #122: the
// hardcoded fallback is gone — anyone holding that string could mint admin
// tokens. With JWT_SECRET unset (or under 32 chars, mirroring the worker
// gate) every JWT check fails closed.
func getJWTSecret() (string, bool) {
	sec := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if len(sec) < 32 {
		return "", false
	}
	return sec, true
}

func base64UrlEncode(b []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(b), "=")
}

func base64UrlDecode(s string) ([]byte, error) {
	if l := len(s) % 4; l > 0 {
		s += strings.Repeat("=", 4-l)
	}
	return base64.URLEncoding.DecodeString(s)
}

// GenerateJWT creates a standard signed HS256 JWT
func GenerateJWT(claims JWTClaims, secret string) (string, error) {
	header := map[string]string{
		"alg": "HS256",
		"typ": "JWT",
	}
	headerBytes, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	if claims.Exp == 0 {
		claims.Exp = time.Now().Add(24 * time.Hour).Unix()
	}
	claimsBytes, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	encodedHeader := base64UrlEncode(headerBytes)
	encodedClaims := base64UrlEncode(claimsBytes)
	signingInput := encodedHeader + "." + encodedClaims

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	signature := base64UrlEncode(mac.Sum(nil))

	return signingInput + "." + signature, nil
}

// ValidateJWT verifies HMAC-SHA256 signature and returns verified claims
func ValidateJWT(tokenStr string, secret string) (*JWTClaims, error) {
	tokenStr = strings.TrimSpace(tokenStr)
	if strings.HasPrefix(tokenStr, "Bearer ") {
		tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")
	}

	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid jwt format")
	}

	signingInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	expectedSig := mac.Sum(nil)

	actualSig, err := base64UrlDecode(parts[2])
	if err != nil {
		return nil, errors.New("invalid signature encoding")
	}

	if !hmac.Equal(actualSig, expectedSig) {
		return nil, errors.New("signature mismatch")
	}

	claimsBytes, err := base64UrlDecode(parts[1])
	if err != nil {
		return nil, errors.New("invalid claims encoding")
	}

	var claims JWTClaims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return nil, err
	}

	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, errors.New("token expired")
	}

	return &claims, nil
}
