# EduCred: Decentralized Micro-Credentials and Rewards Platform

## Overview

EduCred is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world problems in education, such as:

- **Centralized Credential Control**: Traditional platforms lock credentials in silos, making them hard to verify, transfer, or recognize across institutions.
- **High Barriers to Learning**: Education costs are prohibitive, discouraging lifelong learning, especially in developing regions.
- **Lack of Incentives**: Learners often lack motivation for skill acquisition without tangible rewards.
- **Credential Fraud**: Fake certifications undermine trust in hiring and professional development.
- **Inequitable Access**: Discounts and subsidies are controlled by centralized entities, often excluding underserved communities.

EduCred solves these by creating a decentralized system where learners earn verifiable micro-credentials (as NFTs) for completing skills-based modules. They are rewarded with fungible tokens (EDU) that can be redeemed for discounts on future courses. The platform uses blockchain for immutability, transparency, and peer-to-peer interactions. Course providers register offerings, and a DAO governs updates. Verification relies on decentralized oracles (e.g., community or AI-based attestations) to ensure credibility.

This fosters a global, incentive-driven learning ecosystem, reducing costs (via token discounts), enhancing credential portability, and promoting continuous upskilling. For example, a developer in a low-income country could earn micro-creds in coding, get EDU tokens, and use them for advanced courses at a discount.

The project consists of 6 core smart contracts written in Clarity, ensuring security, predictability (no reentrancy), and Bitcoin-layer compatibility via Stacks.

## Tech Stack

- **Blockchain**: Stacks (for Bitcoin settlement and Clarity language).
- **Smart Contract Language**: Clarity (functional, decidable, and secure).
- **Token Standards**: SIP-010 (fungible tokens) and SIP-009 (NFTs) for compatibility.
- **Frontend (Suggested)**: Not implemented here; use Hiro Wallet for interactions, React.js for UI.
- **Deployment**: Use Stacks Explorer for contract deployment and interaction.

## Smart Contracts

EduCred involves 6 solid smart contracts, each with defined traits, functions, and error handling. Below is an overview; full code would be in separate `.clar` files. Contracts are designed to be composable, with read-only functions for queries and public functions for state changes.

### 1. EduToken (Fungible Reward Token - SIP-010 Compliant)
   - **Purpose**: Manages the EDU token, used for rewards and discounts. Tokens are minted upon credential completion and burned/redeemed for course discounts.
   - **Key Features**:
     - Total supply cap (e.g., 1 billion) to prevent inflation.
     - Minting restricted to authorized contracts (e.g., RewardDistributor).
     - Transfer, balance checks, and allowance for delegation.
   - **Main Functions**:
     - `mint (amount u128 recipient principal)`: Mints tokens (private, called by other contracts).
     - `transfer (amount u128 sender principal recipient principal)`: Transfers tokens.
     - `get-balance (owner principal)`: Read-only balance query.
     - `burn (amount u128 owner principal)`: Burns tokens during redemption.
   - **Errors**: Insufficient balance, unauthorized minting.
   - **Traits**: Implements `sip-010-trait`.

### 2. MicroCredNFT (NFT for Micro-Credentials - SIP-009 Compliant)
   - **Purpose**: Issues unique NFTs representing micro-credentials (e.g., "Python Basics" skill). Each NFT includes metadata like skill name, issuer, and verification proof.
   - **Key Features**:
     - Soulbound option (non-transferable by default) to prevent trading fake creds.
     - Metadata stored on-chain or via IPFS hashes.
     - Minting tied to verification completion.
   - **Main Functions**:
     - `mint (token-id u128 recipient principal metadata (string-ascii 256))`: Mints NFT (called by Verifier).
     - `transfer (token-id u128 sender principal recipient principal)`: Optional transfer if not soulbound.
     - `get-owner (token-id u128)`: Read-only owner query.
     - `get-metadata (token-id u128)`: Retrieves skill details.
   - **Errors**: Duplicate ID, unauthorized mint.
   - **Traits**: Implements `sip-009-trait`.

### 3. CourseRegistry (Registry for Courses and Providers)
   - **Purpose**: Allows verified providers to register courses, set prices, and define required micro-creds as prerequisites. Ensures only legitimate courses are available for discounts.
   - **Key Features**:
     - Provider verification via DAO approval.
     - Course details: ID, name, price (in STX or EDU), duration, prerequisites (list of NFT IDs).
     - Mapping of courses to providers.
   - **Main Functions**:
     - `register-course (course-id u128 name (string-ascii 128) price u128 prerequisites (list 10 u128))`: Registers a course (provider-only).
     - `update-course (course-id u128 new-price u128)`: Updates details (provider-only).
     - `get-course-details (course-id u128)`: Read-only query.
     - `verify-provider (provider principal)`: DAO-called verification.
   - **Errors**: Unauthorized registration, invalid prerequisites.
   - **Data Maps**: `courses (u128 -> {name: string, price: u128, ...})`, `providers (principal -> bool)`.

### 4. RewardDistributor (Handles Reward Issuance)
   - **Purpose**: Distributes EDU tokens upon successful skill acquisition and credential minting. Calculates rewards based on difficulty or community votes.
   - **Key Features**:
     - Integrates with Verifier for proof-of-skill.
     - Reward formulas (e.g., base reward + bonus for rare skills).
     - Caps daily/weekly distributions to sustain token economy.
   - **Main Functions**:
     - `distribute-reward (learner principal amount u128 credential-id u128)`: Mints EDU and links to NFT (called post-verification).
     - `calculate-reward (difficulty u8)`: Read-only reward computation.
     - `set-reward-params (base u128 multiplier u128)`: DAO-governed updates.
   - **Errors**: Invalid credential, reward cap exceeded.
   - **Traits**: References EduToken for minting.

### 5. DiscountRedeemer (Token Redemption for Discounts)
   - **Purpose**: Allows learners to redeem EDU tokens for course discounts. Applies discounts dynamically (e.g., 10% off per 100 EDU).
   - **Key Features**:
     - Integrates with CourseRegistry for price checks.
     - Burns redeemed tokens to reduce supply.
     - Off-chain payment handling (e.g., STX transfer with discount applied).
   - **Main Functions**:
     - `redeem-discount (course-id u128 tokens u128 learner principal)`: Burns tokens, computes discounted price.
     - `get-discounted-price (course-id u128 tokens u128)`: Read-only calculation.
     - `complete-purchase (course-id u128 payment-proof (buff 32))`: Verifies payment (oracle-integrated).
   - **Errors**: Insufficient tokens, invalid course.
   - **Data Maps**: `redemptions (principal -> {course-id: u128, discount: u128})`.

### 6. EduDAO (Governance for Platform Decisions)
   - **Purpose**: Decentralized governance for upgrades, reward params, provider approvals, and dispute resolution. EDU holders stake tokens to vote.
   - **Key Features**:
     - Proposal system: Create, vote, execute.
     - Staking for voting power (time-locked).
     - Integration with other contracts for admin actions.
   - **Main Functions**:
     - `create-proposal (id u128 description (string-ascii 512) target-contract principal func-name (string-ascii 128) params (list 5 (buff 128)))`: Submits proposal.
     - `vote (proposal-id u128 vote bool amount u128)`: Stakes EDU to vote.
     - `execute-proposal (proposal-id u128)`: Executes if quorum met.
     - `stake (amount u128)`: Locks tokens for governance.
     - `get-proposal-status (id u128)`: Read-only details.
   - **Errors**: Insufficient stake, proposal expired.
   - **Data Maps**: `proposals (u128 -> {votes-yes: u128, votes-no: u128, ...})`, `stakes (principal -> u128)`.

## Deployment and Usage

1. **Deploy Contracts**:
   - Deploy in order: EduToken → MicroCredNFT → CourseRegistry → RewardDistributor → DiscountRedeemer → EduDAO.
   - Use Stacks CLI: `clarinet deploy`.

2. **Interactions**:
   - Learners: Mint NFTs via Verifier, claim rewards, redeem discounts.
   - Providers: Register courses via CourseRegistry.
   - Governance: Stake EDU and vote on proposals.

3. **Testing**:
   - Use Clarinet for local testing: `clarinet test`.
   - Cover edge cases like unauthorized access, overflow checks.

4. **Security Considerations**:
   - Clarity's decidability prevents runtime errors.
   - Use `define-private` for sensitive logic.
   - Audits recommended before mainnet.

## Roadmap

- **Phase 1**: Core contracts deployment.
- **Phase 2**: Integrate oracles for skill verification (e.g., via Chainlink on Stacks).
- **Phase 3**: Frontend DApp for user-friendly interactions.
- **Phase 4**: Partnerships with education platforms for real-world adoption.

## Contributing

Fork the repo, add improvements (e.g., full Clarity code), and PR. Focus on security and efficiency.

## License

MIT License. See LICENSE file for details.