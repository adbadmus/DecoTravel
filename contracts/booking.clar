;; DecoTravel Booking Contract
;; Clarity v2
;; Manages decentralized reservations for travel services with escrow, refunds, and dispute resolution

(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-BOOKING u201)
(define-constant ERR-BOOKING-EXPIRED u202)
(define-constant ERR-INSUFFICIENT-FUNDS u203)
(define-constant ERR-ALREADY-CONFIRMED u204)
(define-constant ERR-ALREADY-CANCELLED u205)
(define-constant ERR-INVALID-AMOUNT u206)
(define-constant ERR-NOT-PROVIDER u207)
(define-constant ERR-DISPUTE-PENDING u208)
(define-constant ERR-INVALID-TIMESTAMP u209)
(define-constant ERR-ZERO-ADDRESS u210)
(define-constant ERR-CONTRACT-NOT-FOUND u211)

;; Token contract reference
(define-constant TOKEN-CONTRACT 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.travel-token)

;; Data variables
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var dispute-resolution-fee uint u1000000) ;; 1 DTT (6 decimals)

;; Data maps
(define-map providers principal { is-active: bool, reputation: uint })
(define-map bookings 
  { booking-id: uint } 
  { 
    traveler: principal, 
    provider: principal, 
    amount: uint, 
    start-time: uint, 
    end-time: uint, 
    status: (string-ascii 20), 
    escrow-held: uint, 
    dispute-raised: bool 
  }
)
(define-map booking-counter principal uint)

;; Private functions

(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

(define-private (is-provider (account principal))
  (match (map-get? providers account)
    provider-details (get is-active provider-details)
    false
  )
)

(define-private (transfer-token (recipient principal) (amount uint))
  (contract-call? TOKEN-CONTRACT transfer recipient amount none)
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

;; Set dispute resolution fee
(define-public (set-dispute-fee (new-fee uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-fee u0) (err ERR-INVALID-AMOUNT))
    (var-set dispute-resolution-fee new-fee)
    (ok true)
  )
)

;; Register as a provider
(define-public (register-provider)
  (begin
    (ensure-not-paused)
    (asserts! (not (is-provider tx-sender)) (err ERR-ALREADY-CONFIRMED))
    (map-set providers tx-sender { is-active: true, reputation: u0 })
    (ok true)
  )
)

;; Deactivate provider
(define-public (deactivate-provider)
  (begin
    (ensure-not-paused)
    (asserts! (is-provider tx-sender) (err ERR-NOT-PROVIDER))
    (map-set providers tx-sender { is-active: false, reputation: (get reputation (map-get? providers tx-sender)) })
    (ok true)
  )
)

;; Create a booking
(define-public (create-booking (provider principal) (amount uint) (start-time uint) (end-time uint))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq provider 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (is-provider provider) (err ERR-NOT-PROVIDER))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (> start-time block-height) (err ERR-INVALID-TIMESTAMP))
    (asserts! (> end-time start-time) (err ERR-INVALID-TIMESTAMP))
    (let ((booking-id (+ (default-to u0 (map-get? booking-counter tx-sender)) u1)))
      (try! (transfer-token (as-contract tx-sender) amount)) ;; Escrow payment
      (map-set bookings 
        { booking-id: booking-id }
        { 
          traveler: tx-sender, 
          provider: provider, 
          amount: amount, 
          start-time: start-time, 
          end-time: end-time, 
          status: "pending", 
          escrow-held: amount, 
          dispute-raised: false 
        }
      )
      (map-set booking-counter tx-sender booking-id)
      (ok booking-id)
    )
  )
)

;; Confirm booking (by provider)
(define-public (confirm-booking (booking-id uint))
  (begin
    (ensure-not-paused)
    (match (map-get? bookings { booking-id: booking-id })
      booking
      (begin
        (asserts! (is-eq (get provider booking) tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (is-eq (get status booking) "pending") (err ERR-ALREADY-CONFIRMED))
        (asserts! (>= (get start-time booking) block-height) (err ERR-BOOKING-EXPIRED))
        (map-set bookings 
          { booking-id: booking-id } 
          (merge booking { status: "confirmed" })
        )
        (ok true)
      )
      (err ERR-INVALID-BOOKING)
    )
  )
)

;; Cancel booking (by traveler or provider)
(define-public (cancel-booking (booking-id uint))
  (begin
    (ensure-not-paused)
    (match (map-get? bookings { booking-id: booking-id })
      booking
      (begin
        (asserts! (or (is-eq (get traveler booking) tx-sender) (is-eq (get provider booking) tx-sender)) (err ERR-NOT-AUTHORIZED))
        (asserts! (is-eq (get status booking) "pending") (err ERR-ALREADY-CANCELLED))
        (asserts! (>= (get start-time booking) block-height) (err ERR-BOOKING-EXPIRED))
        (try! (as-contract (transfer-token (get traveler booking) (get escrow-held booking))))
        (map-set bookings 
          { booking-id: booking-id } 
          (merge booking { status: "cancelled", escrow-held: u0 })
        )
        (ok true)
      )
      (err ERR-INVALID-BOOKING)
    )
  )
)

;; Complete booking (by provider, releases escrow)
(define-public (complete-booking (booking-id uint))
  (begin
    (ensure-not-paused)
    (match (map-get? bookings { booking-id: booking-id })
      booking
      (begin
        (asserts! (is-eq (get provider booking) tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (is-eq (get status booking) "confirmed") (err ERR-INVALID-BOOKING))
        (asserts! (<= (get end-time booking) block-height) (err ERR-BOOKING-EXPIRED))
        (asserts! (not (get dispute-raised booking)) (err ERR-DISPUTE-PENDING))
        (try! (as-contract (transfer-token (get provider booking) (get escrow-held booking))))
        (map-set providers 
          (get provider booking) 
          { 
            is-active: (get is-active (map-get? providers (get provider booking))), 
            reputation: (+ (get reputation (map-get? providers (get provider booking))) u1) 
          }
        )
        (map-set bookings 
          { booking-id: booking-id } 
          (merge booking { status: "completed", escrow-held: u0 })
        )
        (ok true)
      )
      (err ERR-INVALID-BOOKING)
    )
  )
)

;; Raise dispute (by traveler)
(define-public (raise-dispute (booking-id uint))
  (begin
    (ensure-not-paused)
    (match (map-get? bookings { booking-id: booking-id })
      booking
      (begin
        (asserts! (is-eq (get traveler booking) tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (is-eq (get status booking) "confirmed") (err ERR-INVALID-BOOKING))
        (asserts! (<= (get start-time booking) block-height) (err ERR-BOOKING-EXPIRED))
        (asserts! (not (get dispute-raised booking)) (err ERR-DISPUTE-PENDING))
        (try! (transfer-token (as-contract tx-sender) (var-get dispute-resolution-fee)))
        (map-set bookings 
          { booking-id: booking-id } 
          (merge booking { dispute-raised: true })
        )
        (ok true)
      )
      (err ERR-INVALID-BOOKING)
    )
  )
)

;; Resolve dispute (by admin)
(define-public (resolve-dispute (booking-id uint) (refund-to-traveler bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (match (map-get? bookings { booking-id: booking-id })
      booking
      (begin
        (asserts! (get dispute-raised booking) (err ERR-INVALID-BOOKING))
        (let ((recipient (if refund-to-traveler (get traveler booking) (get provider booking))))
          (try! (as-contract (transfer-token recipient (get escrow-held booking))))
          (map-set bookings 
            { booking-id: booking-id } 
            (merge booking { status: (if refund-to-traveler "refunded" "completed"), escrow-held: u0, dispute-raised: false })
          )
          (if (not refund-to-traveler)
            (map-set providers 
              (get provider booking) 
              { 
                is-active: (get is-active (map-get? providers (get provider booking))), 
                reputation: (+ (get reputation (map-get? providers (get provider booking))) u1) 
              }
            )
            true
          )
          (ok true)
        )
      )
      (err ERR-INVALID-BOOKING)
    )
  )
)

;; Read-only functions

(define-read-only (get-booking (booking-id uint))
  (match (map-get? bookings { booking-id: booking-id })
    booking (ok booking)
    (err ERR-INVALID-BOOKING)
  )
)

(define-read-only (get-provider-details (provider principal))
  (match (map-get? providers provider)
    details (ok details)
    (err ERR-NOT-PROVIDER)
  )
)

(define-read-only (get-booking-counter (traveler principal))
  (ok (default-to u0 (map-get? booking-counter traveler)))
)

(define-read-only (get-dispute-fee)
  (ok (var-get dispute-resolution-fee))
)

(define-read-only (get-admin)
  (ok (var-get admin))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)