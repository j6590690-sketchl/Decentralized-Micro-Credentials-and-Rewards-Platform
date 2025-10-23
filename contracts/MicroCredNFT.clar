;; contracts/micro-cred-nft.clar

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-TOKEN-ID-EXISTS u101)
(define-constant ERR-TOKEN-NOT-FOUND u102)
(define-constant ERR-INVALID-METADATA u103)
(define-constant ERR-SOULBOUND-TRANSFER u104)
(define-constant ERR-VERIFIER-NOT-APPROVED u105)
(define-constant ERR-MAX-SUPPLY-REACHED u106)
(define-constant ERR-INVALID-ISSUER u107)
(define-constant ERR-INVALID-SKILL-LEVEL u108)
(define-constant ERR-METADATA-LOCKED u109)

(define-data-var next-token-id uint u1)
(define-data-var max-supply uint u1000000)
(define-data-var contract-owner principal tx-sender)
(define-data-var metadata-frozen bool false)

(define-map token-metadata
  uint
  {
    skill-name: (string-utf8 64),
    skill-level: uint,
    issuer: principal,
    issue-timestamp: uint,
    expiry-timestamp: (optional uint),
    soulbound: bool,
    ipfs-hash: (string-ascii 128),
    verification-proof: (buff 32)
  }
)

(define-map token-owners uint principal)
(define-map approved-verifiers principal bool)
(define-map issuer-registry principal {name: (string-utf8 100), verified: bool})

(define-read-only (get-token-metadata (token-id uint))
  (map-get? token-metadata token-id)
)

(define-read-only (get-token-owner (token-id uint))
  (map-get? token-owners token-id)
)

(define-read-only (get-next-token-id)
  (ok (var-get next-token-id))
)

(define-read-only (is-verifier-approved (verifier principal))
  (default-to false (map-get? approved-verifiers verifier))
)

(define-read-only (get-issuer-info (issuer principal))
  (map-get? issuer-registry issuer)
)

(define-read-only (is-soulbound (token-id uint))
  (match (map-get? token-metadata token-id)
    data (get soulbound data)
    false
  )
)

(define-private (validate-metadata (skill-name (string-utf8 64)) (skill-level uint) (ipfs-hash (string-ascii 128)))
  (and
    (> (len skill-name) u0)
    (<= (len skill-name) u64)
    (and (>= skill-level u1) (<= skill-level u5))
    (or (is-eq (len ipfs-hash) u0) (and (> (len ipfs-hash) u0) (<= (len ipfs-hash) u128)))
  )
)

(define-private (assert-verifier)
  (asserts! (is-verifier-approved tx-sender) (err ERR-VERIFIER-NOT-APPROVED))
)

(define-private (assert-not-frozen)
  (asserts! (not (var-get metadata-frozen)) (err ERR-METADATA-LOCKED))
)

(define-public (set-contract-owner (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (var-set contract-owner new-owner)
    (ok true)
  )
)

(define-public (freeze-metadata)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (var-set metadata-frozen true)
    (ok true)
  )
)

(define-public (approve-verifier (verifier principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (map-set approved-verifiers verifier true)
    (ok true)
  )
)

(define-public (revoke-verifier (verifier principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (map-delete approved-verifiers verifier)
    (ok true)
  )
)

(define-public (register-issuer (name (string-utf8 100)))
  (begin
    (asserts! (> (len name) u0) (err ERR-INVALID-METADATA))
    (asserts! (is-eq (default-to false (get verified (map-get? issuer-registry tx-sender))) false) (err ERR-INVALID-ISSUER))
    (map-set issuer-registry tx-sender {name: name, verified: false})
    (ok true)
  )
)

(define-public (verify-issuer (issuer principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (match (map-get? issuer-registry issuer)
      data (map-set issuer-registry issuer (merge data {verified: true}))
      (err ERR-INVALID-ISSUER)
    )
    (ok true)
  )
)

(define-public (mint-credential
  (recipient principal)
  (skill-name (string-utf8 64))
  (skill-level uint)
  (expiry-timestamp (optional uint))
  (soulbound bool)
  (ipfs-hash (string-ascii 128))
  (verification-proof (buff 32))
 )
  (let (
        (token-id (var-get next-token-id))
        (current-supply (var-get next-token-id))
        (issuer-data (unwrap! (map-get? issuer-registry tx-sender) (err ERR-INVALID-ISSUER)))
       )
    (assert-verifier)
    (asserts! (get verified issuer-data) (err ERR-INVALID-ISSUER))
    (asserts! (< current-supply (var-get max-supply)) (err ERR-MAX-SUPPLY-REACHED))
    (asserts! (is-none (map-get? token-owners token-id)) (err ERR-TOKEN-ID-EXISTS))
    (asserts! (validate-metadata skill-name skill-level ipfs-hash) (err ERR-INVALID-METADATA))
    (match expiry-timestamp exp (asserts! (>= exp block-height) (err ERR-INVALID-METADATA)) (ok true))
    (map-set token-metadata token-id
      {
        skill-name: skill-name,
        skill-level: skill-level,
        issuer: tx-sender,
        issue-timestamp: block-height,
        expiry-timestamp: expiry-timestamp,
        soulbound: soulbound,
        ipfs-hash: ipfs-hash,
        verification-proof: verification-proof
      }
    )
    (map-set token-owners token-id recipient)
    (var-set next-token-id (+ token-id u1))
    (print {event: "credential-minted", token-id: token-id, recipient: recipient})
    (ok token-id)
  )
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (let ((owner (unwrap! (map-get? token-owners token-id) (err ERR-TOKEN-NOT-FOUND)))
        (metadata (unwrap! (map-get? token-metadata token-id) (err ERR-TOKEN-NOT-FOUND))))
    (asserts! (is-eq owner sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get soulbound metadata)) (err ERR-SOULBOUND-TRANSFER))
    (asserts! (is-eq tx-sender sender) (err ERR-NOT-AUTHORIZED))
    (map-set token-owners token-id recipient)
    (print {event: "credential-transferred", token-id: token-id, from: sender, to: recipient})
    (ok true)
  )
)

(define-public (burn (token-id uint))
  (let ((owner (unwrap! (map-get? token-owners token-id) (err ERR-TOKEN-NOT-FOUND))))
    (asserts! (or (is-eq tx-sender owner) (is-eq tx-sender (var-get contract-owner))) (err ERR-NOT-AUTHORIZED))
    (map-delete token-owners token-id)
    (map-delete token-metadata token-id)
    (print {event: "credential-burned", token-id: token-id})
    (ok true)
  )
)

(define-public (update-metadata
  (token-id uint)
  (new-ipfs-hash (string-ascii 128))
  (new-proof (buff 32))
 )
  (let ((metadata (unwrap! (map-get? token-metadata token-id) (err ERR-TOKEN-NOT-FOUND)))
        (owner (unwrap! (map-get? token-owners token-id) (err ERR-TOKEN-NOT-FOUND))))
    (assert-not-frozen)
    (asserts! (is-eq tx-sender (get issuer metadata)) (err ERR-NOT-AUTHORIZED))
    (map-set token-metadata token-id
      (merge metadata
        {
          ipfs-hash: new-ipfs-hash,
          verification-proof: new-proof
        }
      )
    )
    (print {event: "metadata-updated", token-id: token-id})
    (ok true)
  )
)