import { describe, it, expect, beforeEach } from "vitest";

interface MockBooking {
  admin: string;
  paused: boolean;
  disputeResolutionFee: bigint;
  providers: Map<string, { isActive: boolean; reputation: bigint }>;
  bookings: Map<string, {
    traveler: string;
    provider: string;
    amount: bigint;
    startTime: bigint;
    endTime: bigint;
    status: string;
    escrowHeld: bigint;
    disputeRaised: boolean;
  }>;
  bookingCounter: Map<string, bigint>;
  tokenContract: {
    balances: Map<string, bigint>;
    transfer: (sender: string, recipient: string, amount: bigint) => { value: boolean } | { error: number };
  };
  CONTRACT_ADDRESS: string;
  blockHeight: bigint;

  isAdmin(caller: string): boolean;
  isProvider(account: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  setDisputeFee(caller: string, newFee: bigint): { value: boolean } | { error: number };
  registerProvider(caller: string): { value: boolean } | { error: number };
  deactivateProvider(caller: string): { value: boolean } | { error: number };
  createBooking(caller: string, provider: string, amount: bigint, startTime: bigint, endTime: bigint): { value: bigint } | { error: number };
  confirmBooking(caller: string, bookingId: bigint): { value: boolean } | { error: number };
  cancelBooking(caller: string, bookingId: bigint): { value: boolean } | { error: number };
  completeBooking(caller: string, bookingId: bigint): { value: boolean } | { error: number };
  raiseDispute(caller: string, bookingId: bigint): { value: boolean } | { error: number };
  resolveDispute(caller: string, bookingId: bigint, refundToTraveler: boolean): { value: boolean } | { error: number };
}

const mockBooking: MockBooking = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  disputeResolutionFee: 1_000_000n,
  providers: new Map(),
  bookings: new Map(),
  bookingCounter: new Map(),
  tokenContract: {
    balances: new Map(),
    transfer: (sender: string, recipient: string, amount: bigint) => {
      const senderBal = mockBooking.tokenContract.balances.get(sender) || 0n;
      if (senderBal < amount) return { error: 203 };
      mockBooking.tokenContract.balances.set(sender, senderBal - amount);
      mockBooking.tokenContract.balances.set(recipient, (mockBooking.tokenContract.balances.get(recipient) || 0n) + amount);
      return { value: true };
    },
  },
  CONTRACT_ADDRESS: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.contract",
  blockHeight: 100n,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  isProvider(account: string) {
    const provider = this.providers.get(account);
    return provider ? provider.isActive : false;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 200 };
    this.paused = pause;
    return { value: pause };
  },

  setDisputeFee(caller: string, newFee: bigint) {
    if (!this.isAdmin(caller)) return { error: 200 };
    if (newFee <= 0n) return { error: 206 };
    this.disputeResolutionFee = newFee;
    return { value: true };
  },

  registerProvider(caller: string) {
    if (this.paused) return { error: 104 };
    if (this.isProvider(caller)) return { error: 204 };
    this.providers.set(caller, { isActive: true, reputation: 0n });
    return { value: true };
  },

  deactivateProvider(caller: string) {
    if (this.paused) return { error: 104 };
    if (!this.isProvider(caller)) return { error: 207 };
    this.providers.set(caller, { isActive: false, reputation: this.providers.get(caller)!.reputation });
    return { value: true };
  },

  createBooking(caller: string, provider: string, amount: bigint, startTime: bigint, endTime: bigint) {
    if (this.paused) return { error: 104 };
    if (!this.isProvider(provider)) return { error: 207 };
    if (amount <= 0n) return { error: 206 };
    if (startTime <= this.blockHeight) return { error: 209 };
    if (endTime <= startTime) return { error: 209 };
    const result = this.tokenContract.transfer(caller, this.CONTRACT_ADDRESS, amount);
    if ("error" in result) return result;
    const bookingId = (this.bookingCounter.get(caller) || 0n) + 1n;
    this.bookings.set(bookingId.toString(), {
      traveler: caller,
      provider,
      amount,
      startTime,
      endTime,
      status: "pending",
      escrowHeld: amount,
      disputeRaised: false,
    });
    this.bookingCounter.set(caller, bookingId);
    return { value: bookingId };
  },

  confirmBooking(caller: string, bookingId: bigint) {
    if (this.paused) return { error: 104 };
    const booking = this.bookings.get(bookingId.toString());
    if (!booking) return { error: 201 };
    if (booking.provider !== caller) return { error: 200 };
    if (booking.status !== "pending") return { error: 204 };
    if (booking.startTime < this.blockHeight) return { error: 202 };
    this.bookings.set(bookingId.toString(), { ...booking, status: "confirmed" });
    return { value: true };
  },

  cancelBooking(caller: string, bookingId: bigint) {
    if (this.paused) return { error: 104 };
    const booking = this.bookings.get(bookingId.toString());
    if (!booking) return { error: 201 };
    if (booking.traveler !== caller && booking.provider !== caller) return { error: 200 };
    if (booking.status !== "pending") return { error: 205 };
    if (booking.startTime < this.blockHeight) return { error: 202 };
    const result = this.tokenContract.transfer(this.CONTRACT_ADDRESS, booking.traveler, booking.escrowHeld);
    if ("error" in result) return result;
    this.bookings.set(bookingId.toString(), { ...booking, status: "cancelled", escrowHeld: 0n });
    return { value: true };
  },

  completeBooking(caller: string, bookingId: bigint) {
    if (this.paused) return { error: 104 };
    const booking = this.bookings.get(bookingId.toString());
    if (!booking) return { error: 201 };
    if (booking.provider !== caller) return { error: 200 };
    if (booking.status !== "confirmed") return { error: 201 };
    if (booking.endTime > this.blockHeight) return { error: 202 };
    if (booking.disputeRaised) return { error: 208 };
    const result = this.tokenContract.transfer(this.CONTRACT_ADDRESS, booking.provider, booking.escrowHeld);
    if ("error" in result) return result;
    const providerDetails = this.providers.get(booking.provider)!;
    this.providers.set(booking.provider, { ...providerDetails, reputation: providerDetails.reputation + 1n });
    this.bookings.set(bookingId.toString(), { ...booking, status: "completed", escrowHeld: 0n });
    return { value: true };
  },

  raiseDispute(caller: string, bookingId: bigint) {
    if (this.paused) return { error: 104 };
    const booking = this.bookings.get(bookingId.toString());
    if (!booking) return { error: 201 };
    if (booking.traveler !== caller) return { error: 200 };
    if (booking.status !== "confirmed") return { error: 201 };
    if (booking.startTime > this.blockHeight) return { error: 202 };
    if (booking.disputeRaised) return { error: 208 };
    const result = this.tokenContract.transfer(caller, this.CONTRACT_ADDRESS, this.disputeResolutionFee);
    if ("error" in result) return result;
    this.bookings.set(bookingId.toString(), { ...booking, disputeRaised: true });
    return { value: true };
  },

  resolveDispute(caller: string, bookingId: bigint, refundToTraveler: boolean) {
    if (!this.isAdmin(caller)) return { error: 200 };
    const booking = this.bookings.get(bookingId.toString());
    if (!booking) return { error: 201 };
    if (!booking.disputeRaised) return { error: 201 };
    const recipient = refundToTraveler ? booking.traveler : booking.provider;
    const result = this.tokenContract.transfer(this.CONTRACT_ADDRESS, recipient, booking.escrowHeld);
    if ("error" in result) return result;
    if (!refundToTraveler) {
      const providerDetails = this.providers.get(booking.provider)!;
      this.providers.set(booking.provider, { ...providerDetails, reputation: providerDetails.reputation + 1n });
    }
    this.bookings.set(bookingId.toString(), {
      ...booking,
      status: refundToTraveler ? "refunded" : "completed",
      escrowHeld: 0n,
      disputeRaised: false,
    });
    return { value: true };
  },
};

describe("DecoTravel Booking Contract", () => {
  beforeEach(() => {
    mockBooking.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockBooking.paused = false;
    mockBooking.disputeResolutionFee = 1_000_000n;
    mockBooking.providers = new Map();
    mockBooking.bookings = new Map();
    mockBooking.bookingCounter = new Map();
    mockBooking.tokenContract.balances = new Map();
    mockBooking.blockHeight = 100n;
  });

  it("should allow admin to set paused", () => {
    const result = mockBooking.setPaused(mockBooking.admin, true);
    expect(result).toEqual({ value: true });
    expect(mockBooking.paused).toBe(true);
  });

  it("should prevent non-admin from setting paused", () => {
    const result = mockBooking.setPaused("ST2CY5...", true);
    expect(result).toEqual({ error: 200 });
  });

  it("should allow admin to set dispute fee", () => {
    const result = mockBooking.setDisputeFee(mockBooking.admin, 2_000_000n);
    expect(result).toEqual({ value: true });
    expect(mockBooking.disputeResolutionFee).toBe(2_000_000n);
  });

  it("should prevent setting invalid dispute fee", () => {
    const result = mockBooking.setDisputeFee(mockBooking.admin, 0n);
    expect(result).toEqual({ error: 206 });
  });

  it("should allow provider registration", () => {
    const result = mockBooking.registerProvider("ST2CY5...");
    expect(result).toEqual({ value: true });
    expect(mockBooking.isProvider("ST2CY5...")).toBe(true);
  });

  it("should prevent duplicate provider registration", () => {
    mockBooking.registerProvider("ST2CY5...");
    const result = mockBooking.registerProvider("ST2CY5...");
    expect(result).toEqual({ error: 204 });
  });

  it("should allow provider deactivation", () => {
    mockBooking.registerProvider("ST2CY5...");
    const result = mockBooking.deactivateProvider("ST2CY5...");
    expect(result).toEqual({ value: true });
    expect(mockBooking.isProvider("ST2CY5...")).toBe(false);
  });

  it("should create a booking", () => {
    mockBooking.registerProvider("ST3NB...");
    mockBooking.tokenContract.balances.set("ST2CY5...", 10_000_000n);
    const result = mockBooking.createBooking("ST2CY5...", "ST3NB...", 5_000_000n, 150n, 200n);
    expect(result).toEqual({ value: 1n });
    const booking = mockBooking.bookings.get("1");
    expect(booking).toEqual({
      traveler: "ST2CY5...",
      provider: "ST3NB...",
      amount: 5_000_000n,
      startTime: 150n,
      endTime: 200n,
      status: "pending",
      escrowHeld: 5_000_000n,
      disputeRaised: false,
    });
    expect(mockBooking.tokenContract.balances.get(mockBooking.CONTRACT_ADDRESS)).toBe(5_000_000n);
  });

  it("should prevent booking with invalid provider", () => {
    const result = mockBooking.createBooking("ST2CY5...", "ST3NB...", 5_000_000n, 150n, 200n);
    expect(result).toEqual({ error: 207 });
  });

  it("should confirm booking", () => {
    mockBooking.registerProvider("ST3NB...");
    mockBooking.tokenContract.balances.set("ST2CY5...", 10_000_000n);
    mockBooking.createBooking("ST2CY5...", "ST3NB...", 5_000_000n, 150n, 200n);
    const result = mockBooking.confirmBooking("ST3NB...", 1n);
    expect(result).toEqual({ value: true });
    expect(mockBooking.bookings.get("1")?.status).toBe("confirmed");
  });

  it("should prevent confirming non-pending booking", () => {
    mockBooking.registerProvider("ST3NB...");
    mockBooking.tokenContract.balances.set("ST2CY5...", 10_000_000n);
    mockBooking.createBooking("ST2CY5...", "ST3NB...", 5_000_000n, 150n, 200n);
    mockBooking.confirmBooking("ST3NB...", 1n);
    const result = mockBooking.confirmBooking("ST3NB...", 1n);
    expect(result).toEqual({ error: 204 });
  });

  it("should cancel booking", () => {
    mockBooking.registerProvider("ST3NB...");
    mockBooking.tokenContract.balances.set("ST2CY5...", 10_000_000n);
    mockBooking.createBooking("ST2CY5...", "ST3NB...", 5_000_000n, 150n, 200n);
    const result = mockBooking.cancelBooking("ST2CY5...", 1n);
    expect(result).toEqual({ value: true });
    expect(mockBooking.bookings.get("1")?.status).toBe("cancelled");
    expect(mockBooking.bookings.get("1")?.escrowHeld).toBe(0n);
    expect(mockBooking.tokenContract.balances.get("ST2CY5...")).toBe(10_000_000n);
  });

  it("should complete booking", () => {
    mockBooking.registerProvider("ST3NB...");
    mockBooking.tokenContract.balances.set("ST2CY5...", 10_000_000n);
    mockBooking.createBooking("ST2CY5...", "ST3NB...", 5_000_000n, 150n, 200n);
    mockBooking.confirmBooking("ST3NB...", 1n);
    mockBooking.blockHeight = 200n;
    const result = mockBooking.completeBooking("ST3NB...", 1n);
    expect(result).toEqual({ value: true });
    expect(mockBooking.bookings.get("1")?.status).toBe("completed");
    expect(mockBooking.bookings.get("1")?.escrowHeld).toBe(0n);
    expect(mockBooking.tokenContract.balances.get("ST3NB...")).toBe(5_000_000n);
    expect(mockBooking.providers.get("ST3NB...")?.reputation).toBe(1n);
  });

  it("should raise dispute", () => {
    mockBooking.registerProvider("ST3NB...");
    mockBooking.tokenContract.balances.set("ST2CY5...", 10_000_000n);
    mockBooking.createBooking("ST2CY5...", "ST3NB...", 5_000_000n, 150n, 200n);
    mockBooking.confirmBooking("ST3NB...", 1n);
    mockBooking.blockHeight = 150n;
    const result = mockBooking.raiseDispute("ST2CY5...", 1n);
    expect(result).toEqual({ value: true });
    expect(mockBooking.bookings.get("1")?.disputeRaised).toBe(true);
    expect(mockBooking.tokenContract.balances.get(mockBooking.CONTRACT_ADDRESS)).toBe(6_000_000n);
  });

  it("should resolve dispute without refund", () => {
    mockBooking.registerProvider("ST3NB...");
    mockBooking.tokenContract.balances.set("ST2CY5...", 10_000_000n);
    mockBooking.createBooking("ST2CY5...", "ST3NB...", 5_000_000n, 150n, 200n);
    mockBooking.confirmBooking("ST3NB...", 1n);
    mockBooking.blockHeight = 150n;
    mockBooking.raiseDispute("ST2CY5...", 1n);
    const result = mockBooking.resolveDispute(mockBooking.admin, 1n, false);
    expect(result).toEqual({ value: true });
    expect(mockBooking.bookings.get("1")?.status).toBe("completed");
    expect(mockBooking.bookings.get("1")?.escrowHeld).toBe(0n);
    expect(mockBooking.tokenContract.balances.get("ST3NB...")).toBe(5_000_000n);
    expect(mockBooking.providers.get("ST3NB...")?.reputation).toBe(1n);
  });
});