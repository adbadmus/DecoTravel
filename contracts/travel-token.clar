;; DecoTravel Travel Token Contract
;; Clarity v2
;; Implements SIP-010 fungible token standard with additional features for loyalty rewards, staking, and admin controls

;; Constants for errors
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INSUFFICIENT-STAKE u102)
(define-constant ERR-MAX-SUPPLY-REACHED u103)
(define-constant ERR-PAUSED u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-ALREADY-MINTER u107)
(define-constant ERR-NOT-MINTER u108)
(define-constant ERR-URI-UPDATE-FAILED u109)

;; Token metadata constants
(define-constant TOKEN-NAME "DecoTravel Token")
(define-constant TOKEN-SYMBOL "DTT")
(define-constant TOKEN-DECIMALS u6)
(define-constant MAX-SUPPLY u100000000000000) ;; 100M tokens with 6 decimals

;; Define the fungible token
(define-fungible-token travel-token MAX-SUPPLY)

;; Data variables
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var token-uri (optional (string-utf8 256)) none)

;; Maps
(define-map minters principal bool)
(define-map staked-balances principal uint)
(define-map allowances { spender: principal, owner: principal } uint) ;; Added for approval mechanism

;; Private functions

(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

(define-private (is-minter (account principal))
  (default-to false (map-get? minters account))
)

;; Public functions

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Set token URI
(define-public (set-token-uri (new-uri (string-utf8 256)))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set token-uri (some new-uri))
    (ok true)
  )
)

;; Add a minter
(define-public (add-minter (new-minter principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-minter 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (not (is-minter new-minter)) (err ERR-ALREADY-MINTER))
    (map-set minters new-minter true)
    (ok true)
  )
)

;; Remove a minter
(define-public (remove-minter (old-minter principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-minter old-minter) (err ERR-NOT-MINTER))
    (map-delete minters old-minter)
    (ok true)
  )
)

;; Mint new tokens
(define-public (mint (recipient principal) (amount uint))
  (begin
    (asserts! (or (is-admin) (is-minter tx-sender)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((new-supply (+ (ft-get-supply travel-token) amount)))
      (asserts! (<= new-supply MAX-SUPPLY) (err ERR-MAX-SUPPLY-REACHED))
      (try! (ft-mint? travel-token amount recipient))
      (ok true)
    )
  )
)

;; Burn tokens
(define-public (burn (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((balance (ft-get-balance travel-token tx-sender)))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (try! (ft-burn? travel-token amount tx-sender))
      (ok true)
    )
  )
)

;; Transfer tokens (SIP-010 compliant)
(define-public (transfer (recipient principal) (amount uint) (memo (optional (buff 34))))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((sender-balance (ft-get-balance travel-token tx-sender)))
      (asserts! (>= sender-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (try! (ft-transfer? travel-token amount tx-sender recipient))
      (match memo some-memo (print some-memo) true)
      (ok true)
    )
  )
)

;; Approve spender (added for flexibility, though not in SIP-010)
(define-public (approve (spender principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq spender 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (map-set allowances {spender: spender, owner: tx-sender} amount)
    (ok true)
  )
)

;; Transfer from (using allowance)
(define-public (transfer-from (owner principal) (recipient principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (let ((allowance (default-to u0 (map-get? allowances {spender: tx-sender, owner: owner}))))
      (asserts! (>= allowance amount) (err ERR-INSUFFICIENT-BALANCE))
      (let ((owner-balance (ft-get-balance travel-token owner)))
        (asserts! (>= owner-balance amount) (err ERR-INSUFFICIENT-BALANCE))
        (map-set allowances {spender: tx-sender, owner: owner} (- allowance amount))
        (try! (as-contract (ft-transfer? travel-token amount owner recipient)))
        (ok true)
      )
    )
  )
)

;; Stake tokens for rewards/governance
(define-public (stake (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((balance (ft-get-balance travel-token tx-sender)))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (try! (ft-transfer? travel-token amount tx-sender (as-contract tx-sender)))
      (map-set staked-balances tx-sender (+ amount (default-to u0 (map-get? staked-balances tx-sender))))
      (ok true)
    )
  )
)

;; Unstake tokens
(define-public (unstake (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((stake-balance (default-to u0 (map-get? staked-balances tx-sender))))
      (asserts! (>= stake-balance amount) (err ERR-INSUFFICIENT-STAKE))
      (map-set staked-balances tx-sender (- stake-balance amount))
      (try! (as-contract (ft-transfer? travel-token amount tx-sender tx-sender)))
      (ok true)
    )
  )
)

;; Read-only functions (SIP-010)

(define-read-only (get-name)
  (ok TOKEN-NAME)
)

(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance travel-token account))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply travel-token))
)

(define-read-only (get-token-uri)
  (ok (var-get token-uri))
)

;; Additional read-only

(define-read-only (get-staked-balance (account principal))
  (ok (default-to u0 (map-get? staked-balances account)))
)

(define-read-only (get-allowance (owner principal) (spender principal))
  (ok (default-to u0 (map-get? allowances {spender: spender, owner: owner})))
)

(define-read-only (get-admin)
  (ok (var-get admin))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)

(define-read-only (check-minter (account principal))
  (ok (is-minter account))
)

;; Initialize admin as minter
(map-set minters (var-get admin) true)