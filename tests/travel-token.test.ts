import { describe, it, expect, beforeEach } from "vitest";

interface MockContract {
  admin: string;
  paused: boolean;
  totalSupply: bigint;
  balances: Map<string, bigint>;
  staked: Map<string, bigint>;
  minters: Set<string>;
  allowances: Map<string, bigint>; // Key as `${owner}-${spender}`
  tokenUri: string | null;
  MAX_SUPPLY: bigint;
  CONTRACT_ADDRESS: string; // Simulate contract principal

  isAdmin(caller: string): boolean;
  isMinter(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  setTokenUri(caller: string, uri: string): { value: boolean } | { error: number };
  addMinter(caller: string, newMinter: string): { value: boolean } | { error: number };
  removeMinter(caller: string, oldMinter: string): { value: boolean } | { error: number };
  mint(caller: string, recipient: string, amount: bigint): { value: boolean } | { error: number };
  burn(caller: string, amount: bigint): { value: boolean } | { error: number };
  transfer(caller: string, recipient: string, amount: bigint, memo?: string): { value: boolean } | { error: number };
  approve(caller: string, spender: string, amount: bigint): { value: boolean } | { error: number };
  transferFrom(caller: string, owner: string, recipient: string, amount: bigint): { value: boolean } | { error: number };
  stake(caller: string, amount: bigint): { value: boolean } | { error: number };
  unstake(caller: string, amount: bigint): { value: boolean } | { error: number };
  getBalance(account: string): bigint;
  getStakedBalance(account: string): bigint;
  getAllowance(owner: string, spender: string): bigint;
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  totalSupply: 0n,
  balances: new Map<string, bigint>(),
  staked: new Map<string, bigint>(),
  minters: new Set<string>(),
  allowances: new Map<string, bigint>(),
  tokenUri: null,
  MAX_SUPPLY: 100_000_000_000_000n,
  CONTRACT_ADDRESS: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.contract",

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  isMinter(caller: string) {
    return this.minters.has(caller);
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  setTokenUri(caller: string, uri: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.tokenUri = uri;
    return { value: true };
  },

  addMinter(caller: string, newMinter: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (this.minters.has(newMinter)) return { error: 107 };
    this.minters.add(newMinter);
    return { value: true };
  },

  removeMinter(caller: string, oldMinter: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (!this.minters.has(oldMinter)) return { error: 108 };
    this.minters.delete(oldMinter);
    return { value: true };
  },

  mint(caller: string, recipient: string, amount: bigint) {
    if (!this.isAdmin(caller) && !this.isMinter(caller)) return { error: 100 };
    if (amount <= 0n) return { error: 106 };
    if (this.totalSupply + amount > this.MAX_SUPPLY) return { error: 103 };
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    this.totalSupply += amount;
    return { value: true };
  },

  burn(caller: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (amount <= 0n) return { error: 106 };
    const bal = this.balances.get(caller) || 0n;
    if (bal < amount) return { error: 101 };
    this.balances.set(caller, bal - amount);
    this.totalSupply -= amount;
    return { value: true };
  },

  transfer(caller: string, recipient: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (amount <= 0n) return { error: 106 };
    const bal = this.balances.get(caller) || 0n;
    if (bal < amount) return { error: 101 };
    this.balances.set(caller, bal - amount);
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    return { value: true };
  },

  approve(caller: string, spender: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (amount <= 0n) return { error: 106 };
    const key = `${caller}-${spender}`;
    this.allowances.set(key, amount);
    return { value: true };
  },

  transferFrom(caller: string, owner: string, recipient: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    const key = `${owner}-${caller}`;
    const allowance = this.allowances.get(key) || 0n;
    if (allowance < amount) return { error: 101 };
    const ownerBal = this.balances.get(owner) || 0n;
    if (ownerBal < amount) return { error: 101 };
    this.allowances.set(key, allowance - amount);
    this.balances.set(owner, ownerBal - amount);
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    return { value: true };
  },

  stake(caller: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (amount <= 0n) return { error: 106 };
    const bal = this.balances.get(caller) || 0n;
    if (bal < amount) return { error: 101 };
    this.balances.set(caller, bal - amount);
    // Simulate transfer to contract: increase contract balance
    this.balances.set(this.CONTRACT_ADDRESS, (this.balances.get(this.CONTRACT_ADDRESS) || 0n) + amount);
    this.staked.set(caller, (this.staked.get(caller) || 0n) + amount);
    return { value: true };
  },

  unstake(caller: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (amount <= 0n) return { error: 106 };
    const stakeBal = this.staked.get(caller) || 0n;
    if (stakeBal < amount) return { error: 102 };
    this.staked.set(caller, stakeBal - amount);
    // Simulate transfer from contract: decrease contract balance
    this.balances.set(this.CONTRACT_ADDRESS, (this.balances.get(this.CONTRACT_ADDRESS) || 0n) - amount);
    this.balances.set(caller, (this.balances.get(caller) || 0n) + amount);
    return { value: true };
  },

  getBalance(account: string): bigint {
    return this.balances.get(account) || 0n;
  },

  getStakedBalance(account: string): bigint {
    return this.staked.get(account) || 0n;
  },

  getAllowance(owner: string, spender: string): bigint {
    const key = `${owner}-${spender}`;
    return this.allowances.get(key) || 0n;
  },
};

describe("DecoTravel Travel Token Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.totalSupply = 0n;
    mockContract.balances = new Map();
    mockContract.staked = new Map();
    mockContract.minters = new Set([mockContract.admin]); // Initialize admin as minter
    mockContract.allowances = new Map();
    mockContract.tokenUri = null;
  });

  it("should allow admin to set paused", () => {
    const result = mockContract.setPaused(mockContract.admin, true);
    expect(result).toEqual({ value: true });
    expect(mockContract.paused).toBe(true);
  });

  it("should prevent non-admin from setting paused", () => {
    const result = mockContract.setPaused("ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0", true);
    expect(result).toEqual({ error: 100 });
  });

  it("should allow admin to set token URI", () => {
    const result = mockContract.setTokenUri(mockContract.admin, "ipfs://example");
    expect(result).toEqual({ value: true });
    expect(mockContract.tokenUri).toBe("ipfs://example");
  });

  it("should allow admin to add minter", () => {
    const newMinter = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    const result = mockContract.addMinter(mockContract.admin, newMinter);
    expect(result).toEqual({ value: true });
    expect(mockContract.minters.has(newMinter)).toBe(true);
  });

  it("should prevent adding existing minter", () => {
    const result = mockContract.addMinter(mockContract.admin, mockContract.admin);
    expect(result).toEqual({ error: 107 });
  });

  it("should allow admin to remove minter", () => {
    const result = mockContract.removeMinter(mockContract.admin, mockContract.admin);
    expect(result).toEqual({ value: true });
    expect(mockContract.minters.has(mockContract.admin)).toBe(false);
  });

  it("should prevent removing non-minter", () => {
    mockContract.minters.delete(mockContract.admin);
    const result = mockContract.removeMinter(mockContract.admin, mockContract.admin);
    expect(result).toEqual({ error: 108 });
  });

  it("should mint tokens when called by admin", () => {
    const recipient = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    const result = mockContract.mint(mockContract.admin, recipient, 1000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getBalance(recipient)).toBe(1000n);
    expect(mockContract.totalSupply).toBe(1000n);
  });

  it("should mint tokens when called by minter", () => {
    const minter = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP";
    mockContract.addMinter(mockContract.admin, minter);
    const recipient = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    const result = mockContract.mint(minter, recipient, 1000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getBalance(recipient)).toBe(1000n);
  });

  it("should prevent minting over max supply", () => {
    const result = mockContract.mint(mockContract.admin, "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0", 200_000_000_000_000n);
    expect(result).toEqual({ error: 103 });
  });

  it("should prevent minting zero amount", () => {
    const result = mockContract.mint(mockContract.admin, "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0", 0n);
    expect(result).toEqual({ error: 106 });
  });

  it("should burn tokens", () => {
    const caller = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    mockContract.mint(mockContract.admin, caller, 500n);
    const result = mockContract.burn(caller, 200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getBalance(caller)).toBe(300n);
    expect(mockContract.totalSupply).toBe(300n);
  });

  it("should prevent burning more than balance", () => {
    const caller = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    mockContract.mint(mockContract.admin, caller, 500n);
    const result = mockContract.burn(caller, 600n);
    expect(result).toEqual({ error: 101 });
  });

  it("should transfer tokens", () => {
    const sender = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    const recipient = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP";
    mockContract.mint(mockContract.admin, sender, 500n);
    const result = mockContract.transfer(sender, recipient, 200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getBalance(sender)).toBe(300n);
    expect(mockContract.getBalance(recipient)).toBe(200n);
  });

  it("should prevent transfer when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.transfer("ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0", "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", 10n);
    expect(result).toEqual({ error: 104 });
  });

  it("should approve spender", () => {
    const owner = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    const spender = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP";
    const result = mockContract.approve(owner, spender, 300n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getAllowance(owner, spender)).toBe(300n);
  });

  it("should transfer from using allowance", () => {
    const owner = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    const spender = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP";
    const recipient = "ST4J2GDGJ85WP2THVDX4SP2YEGNRDEVFSH7E7GTT";
    mockContract.mint(mockContract.admin, owner, 500n);
    mockContract.approve(owner, spender, 200n);
    const result = mockContract.transferFrom(spender, owner, recipient, 100n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getBalance(owner)).toBe(400n);
    expect(mockContract.getBalance(recipient)).toBe(100n);
    expect(mockContract.getAllowance(owner, spender)).toBe(100n);
  });

  it("should prevent transfer from exceeding allowance", () => {
    const owner = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    const spender = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP";
    const recipient = "ST4J2GDGJ85WP2THVDX4SP2YEGNRDEVFSH7E7GTT";
    mockContract.mint(mockContract.admin, owner, 500n);
    mockContract.approve(owner, spender, 200n);
    const result = mockContract.transferFrom(spender, owner, recipient, 300n);
    expect(result).toEqual({ error: 101 });
  });

  it("should stake tokens", () => {
    const caller = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    mockContract.mint(mockContract.admin, caller, 500n);
    const result = mockContract.stake(caller, 200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getBalance(caller)).toBe(300n);
    expect(mockContract.getStakedBalance(caller)).toBe(200n);
    expect(mockContract.getBalance(mockContract.CONTRACT_ADDRESS)).toBe(200n);
  });

  it("should unstake tokens", () => {
    const caller = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    mockContract.mint(mockContract.admin, caller, 500n);
    mockContract.stake(caller, 200n);
    const result = mockContract.unstake(caller, 100n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getStakedBalance(caller)).toBe(100n);
    expect(mockContract.getBalance(caller)).toBe(400n);
    expect(mockContract.getBalance(mockContract.CONTRACT_ADDRESS)).toBe(100n);
  });

  it("should prevent unstaking more than staked", () => {
    const caller = "ST2CY5V39NHDP5PWEAGS0R8Z82RIT8XMFDVJTXFY0";
    mockContract.mint(mockContract.admin, caller, 500n);
    mockContract.stake(caller, 200n);
    const result = mockContract.unstake(caller, 300n);
    expect(result).toEqual({ error: 102 });
  });
});