// tests/micro-cred-nft.test.ts

import { describe, it, expect, beforeEach } from "vitest";

interface TokenMetadata {
  "skill-name": string;
  "skill-level": bigint;
  issuer: string;
  "issue-timestamp": bigint;
  "expiry-timestamp": bigint | null;
  soulbound: boolean;
  "ipfs-hash": string;
  "verification-proof": Uint8Array;
}

interface MockState {
  nextTokenId: bigint;
  maxSupply: bigint;
  contractOwner: string;
  metadataFrozen: boolean;
  tokenMetadata: Map<bigint, TokenMetadata>;
  tokenOwners: Map<bigint, string>;
  approvedVerifiers: Set<string>;
  issuerRegistry: Map<string, { name: string; verified: boolean }>;
}

interface ClarityResult {
  type: "ok" | "err";
  result: bigint | number | boolean;
}

class MicroCredNFTMock {
  state: MockState = {
    nextTokenId: 1n,
    maxSupply: 1_000_000n,
    contractOwner: "ST1OWNER",
    metadataFrozen: false,
    tokenMetadata: new Map(),
    tokenOwners: new Map(),
    approvedVerifiers: new Set(),
    issuerRegistry: new Map(),
  };
  caller: string = "ST1OWNER";
  blockHeight: bigint = 100n;

  reset() {
    this.state = {
      nextTokenId: 1n,
      maxSupply: 1_000_000n,
      contractOwner: "ST1OWNER",
      metadataFrozen: false,
      tokenMetadata: new Map(),
      tokenOwners: new Map(),
      approvedVerifiers: new Set(),
      issuerRegistry: new Map(),
    };
    this.caller = "ST1OWNER";
    this.blockHeight = 100n;
  }

  setCaller(principal: string) {
    this.caller = principal;
  }

  setBlockHeight(height: bigint) {
    this.blockHeight = height;
  }

  setContractOwner(newOwner: string): ClarityResult {
    if (this.caller !== this.state.contractOwner) {
      return { type: "err", result: 100 };
    }
    this.state.contractOwner = newOwner;
    return { type: "ok", result: true };
  }

  freezeMetadata(): ClarityResult {
    if (this.caller !== this.state.contractOwner) {
      return { type: "err", result: 100 };
    }
    this.state.metadataFrozen = true;
    return { type: "ok", result: true };
  }

  approveVerifier(verifier: string): ClarityResult {
    if (this.caller !== this.state.contractOwner) {
      return { type: "err", result: 100 };
    }
    this.state.approvedVerifiers.add(verifier);
    return { type: "ok", result: true };
  }

  revokeVerifier(verifier: string): ClarityResult {
    if (this.caller !== this.state.contractOwner) {
      return { type: "err", result: 100 };
    }
    this.state.approvedVerifiers.delete(verifier);
    return { type: "ok", result: true };
  }

  registerIssuer(name: string): ClarityResult {
    if (!name || name.length === 0 || name.length > 100) {
      return { type: "err", result: 103 };
    }
    if (this.state.issuerRegistry.has(this.caller)) {
      return { type: "err", result: 107 };
    }
    this.state.issuerRegistry.set(this.caller, { name, verified: false });
    return { type: "ok", result: true };
  }

  verifyIssuer(issuer: string): ClarityResult {
    if (this.caller !== this.state.contractOwner) {
      return { type: "err", result: 100 };
    }
    const data = this.state.issuerRegistry.get(issuer);
    if (!data) {
      return { type: "err", result: 107 };
    }
    this.state.issuerRegistry.set(issuer, { ...data, verified: true });
    return { type: "ok", result: true };
  }

  mintCredential(
    recipient: string,
    skillName: string,
    skillLevel: bigint,
    expiryTimestamp: bigint | null,
    soulbound: boolean,
    ipfsHash: string,
    verificationProof: Uint8Array
  ): ClarityResult {
    const issuerData = this.state.issuerRegistry.get(this.caller);
    if (!issuerData) {
      return { type: "err", result: 107 };
    }
    if (!issuerData.verified) {
      return { type: "err", result: 107 };
    }
    if (!this.state.approvedVerifiers.has(this.caller)) {
      return { type: "err", result: 105 };
    }
    if (this.state.nextTokenId >= this.state.maxSupply) {
      return { type: "err", result: 106 };
    }
    const tokenId = this.state.nextTokenId;
    if (this.state.tokenOwners.has(tokenId)) {
      return { type: "err", result: 101 };
    }
    if (!skillName || skillName.length > 64) {
      return { type: "err", result: 103 };
    }
    if (skillLevel < 1n || skillLevel > 5n) {
      return { type: "err", result: 108 };
    }
    if (ipfsHash.length > 128) {
      return { type: "err", result: 103 };
    }
    if (verificationProof.length !== 32) {
      return { type: "err", result: 103 };
    }
    if (expiryTimestamp !== null && expiryTimestamp < this.blockHeight) {
      return { type: "err", result: 103 };
    }

    this.state.tokenMetadata.set(tokenId, {
      "skill-name": skillName,
      "skill-level": skillLevel,
      issuer: this.caller,
      "issue-timestamp": this.blockHeight,
      "expiry-timestamp": expiryTimestamp,
      soulbound,
      "ipfs-hash": ipfsHash,
      "verification-proof": verificationProof,
    });
    this.state.tokenOwners.set(tokenId, recipient);
    this.state.nextTokenId += 1n;
    return { type: "ok", result: tokenId };
  }

  transfer(tokenId: bigint, sender: string, recipient: string): ClarityResult {
    const owner = this.state.tokenOwners.get(tokenId);
    const metadata = this.state.tokenMetadata.get(tokenId);
    if (!owner || !metadata) {
      return { type: "err", result: 102 };
    }
    if (owner !== sender || this.caller !== sender) {
      return { type: "err", result: 100 };
    }
    if (metadata.soulbound) {
      return { type: "err", result: 104 };
    }
    this.state.tokenOwners.set(tokenId, recipient);
    return { type: "ok", result: true };
  }

  burn(tokenId: bigint): ClarityResult {
    const owner = this.state.tokenOwners.get(tokenId);
    if (!owner) {
      return { type: "err", result: 102 };
    }
    if (this.caller !== owner && this.caller !== this.state.contractOwner) {
      return { type: "err", result: 100 };
    }
    this.state.tokenOwners.delete(tokenId);
    this.state.tokenMetadata.delete(tokenId);
    return { type: "ok", result: true };
  }

  updateMetadata(tokenId: bigint, newIpfsHash: string, newProof: Uint8Array): ClarityResult {
    if (this.state.metadataFrozen) {
      return { type: "err", result: 109 };
    }
    const metadata = this.state.tokenMetadata.get(tokenId);
    const owner = this.state.tokenOwners.get(tokenId);
    if (!metadata || !owner) {
      return { type: "err", result: 102 };
    }
    if (this.caller !== metadata.issuer) {
      return { type: "err", result: 100 };
    }
    if (newIpfsHash.length > 128 || newProof.length !== 32) {
      return { type: "err", result: 103 };
    }
    this.state.tokenMetadata.set(tokenId, {
      ...metadata,
      "ipfs-hash": newIpfsHash,
      "verification-proof": newProof,
    });
    return { type: "ok", result: true };
  }

  getTokenMetadata(tokenId: bigint): TokenMetadata | null {
    return this.state.tokenMetadata.get(tokenId) || null;
  }

  getTokenOwner(tokenId: bigint): string | null {
    return this.state.tokenOwners.get(tokenId) || null;
  }

  getNextTokenId(): bigint {
    return this.state.nextTokenId;
  }
}

describe("MicroCredNFT", () => {
  let contract: MicroCredNFTMock;

  beforeEach(() => {
    contract = new MicroCredNFTMock();
    contract.reset();
  });

  it("mints credential successfully", () => {
    contract.approveVerifier("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");
    contract.registerIssuer("Tech Academy");
    contract.setCaller("ST1OWNER");
    contract.verifyIssuer("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");

    const result = contract.mintCredential(
      "ST1LEARNER",
      "Solidity Basics",
      3n,
      null,
      false,
      "ipfs://Qm...",
      new Uint8Array(32)
    );

    expect(result.type).toBe("ok");
    expect(result.result).toBe(1n);

    const metadata = contract.getTokenMetadata(1n);
    expect(metadata?.["skill-name"]).toBe("Solidity Basics");
    expect(metadata?.["skill-level"]).toBe(3n);
    expect(metadata?.soulbound).toBe(false);
    expect(contract.getTokenOwner(1n)).toBe("ST1LEARNER");
  });

  it("rejects mint by unapproved verifier", () => {
    contract.setCaller("ST1UNAPPROVED");
    contract.registerIssuer("Fake");
    contract.setCaller("ST1OWNER");
    contract.verifyIssuer("ST1UNAPPROVED");
    contract.setCaller("ST1UNAPPROVED");

    const result = contract.mintCredential(
      "ST1LEARNER",
      "Rust",
      2n,
      null,
      false,
      "",
      new Uint8Array(32)
    );

    expect(result.type).toBe("err");
    expect(result.result).toBe(105);
  });

  it("enforces soulbound transfer restriction", () => {
    contract.approveVerifier("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");
    contract.registerIssuer("Academy");
    contract.setCaller("ST1OWNER");
    contract.verifyIssuer("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");

    contract.mintCredential("ST1A", "Web3", 1n, null, true, "", new Uint8Array(32));
    contract.setCaller("ST1A");

    const result = contract.transfer(1n, "ST1A", "ST1B");
    expect(result.type).toBe("err");
    expect(result.result).toBe(104);
  });

  it("allows transfer of non-soulbound NFT", () => {
    contract.approveVerifier("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");
    contract.registerIssuer("Academy");
    contract.setCaller("ST1OWNER");
    contract.verifyIssuer("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");

    contract.mintCredential("ST1A", "Clarity", 4n, null, false, "", new Uint8Array(32));
    contract.setCaller("ST1A");

    const result = contract.transfer(1n, "ST1A", "ST1B");
    expect(result.type).toBe("ok");
    expect(contract.getTokenOwner(1n)).toBe("ST1B");
  });

  it("prevents metadata update after freeze", () => {
    contract.approveVerifier("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");
    contract.registerIssuer("Academy");
    contract.setCaller("ST1OWNER");
    contract.verifyIssuer("ST1VERIFIER");
    contract.freezeMetadata();
    contract.setCaller("ST1VERIFIER");

    contract.mintCredential("ST1A", "Go", 2n, null, false, "", new Uint8Array(32));
    const result = contract.updateMetadata(1n, "new-ipfs", new Uint8Array(32));

    expect(result.type).toBe("err");
    expect(result.result).toBe(109);
  });

  it("burns credential by owner", () => {
    contract.approveVerifier("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");
    contract.registerIssuer("Academy");
    contract.setCaller("ST1OWNER");
    contract.verifyIssuer("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");

    contract.mintCredential("ST1A", "TypeScript", 3n, null, false, "", new Uint8Array(32));
    contract.setCaller("ST1A");

    const result = contract.burn(1n);
    expect(result.type).toBe("ok");
    expect(contract.getTokenOwner(1n)).toBeNull();
  });

  it("validates skill level range", () => {
    contract.approveVerifier("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");
    contract.registerIssuer("Academy");
    contract.setCaller("ST1OWNER");
    contract.verifyIssuer("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");

    const result = contract.mintCredential(
      "ST1A",
      "Invalid",
      6n,
      null,
      false,
      "",
      new Uint8Array(32)
    );

    expect(result.type).toBe("err");
    expect(result.result).toBe(108);
  });

  it("enforces max supply", () => {
    contract.state.nextTokenId = contract.state.maxSupply - 1n;
    contract.approveVerifier("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");
    contract.registerIssuer("Academy");
    contract.setCaller("ST1OWNER");
    contract.verifyIssuer("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");

    contract.mintCredential("ST1A", "Last", 1n, null, false, "", new Uint8Array(32));
    const result = contract.mintCredential("ST1B", "Over", 1n, null, false, "", new Uint8Array(32));

    expect(result.type).toBe("err");
    expect(result.result).toBe(106);
  });

  it("allows contract owner to burn any token", () => {
    contract.approveVerifier("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");
    contract.registerIssuer("Academy");
    contract.setCaller("ST1OWNER");
    contract.verifyIssuer("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");

    contract.mintCredential("ST1A", "AdminBurn", 1n, null, false, "", new Uint8Array(32));
    contract.setCaller("ST1OWNER");

    const result = contract.burn(1n);
    expect(result.type).toBe("ok");
    expect(contract.getTokenOwner(1n)).toBeNull();
  });

  it("rejects transfer by non-owner", () => {
    contract.approveVerifier("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");
    contract.registerIssuer("Academy");
    contract.setCaller("ST1OWNER");
    contract.verifyIssuer("ST1VERIFIER");
    contract.setCaller("ST1VERIFIER");

    contract.mintCredential("ST1A", "Secure", 1n, null, false, "", new Uint8Array(32));
    contract.setCaller("ST1HACKER");

    const result = contract.transfer(1n, "ST1A", "ST1B");
    expect(result.type).toBe("err");
    expect(result.result).toBe(100);
  });
});