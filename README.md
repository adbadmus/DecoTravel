# DecoTravel

A blockchain-powered decentralized platform for tourism and hospitality that eliminates intermediaries, ensures transparent bookings, and rewards sustainable travel practices — all on-chain, promoting seamless cross-border experiences.

---

## Overview

DecoTravel consists of four main smart contracts that together form a decentralized, transparent, and rewarding ecosystem for travelers and service providers:

1. **Travel Token Contract** – Issues and manages loyalty tokens for bookings and rewards.
2. **Booking Contract** – Handles secure, intermediary-free reservations for accommodations, tours, and experiences.
3. **Identity Verification Contract** – Enables verifiable traveler identities for seamless cross-border travel and trust-building.
4. **Experience NFT Contract** – Tokenizes unique travel experiences, such as virtual tours or exclusive events, with royalties for creators.

This platform solves real-world problems like high intermediary fees (e.g., from platforms like Booking.com or Airbnb), lack of transparency in reservations, identity verification challenges for international travel, and siloed loyalty programs that don't transfer across providers. By using Web3, it empowers direct peer-to-peer bookings, rewards eco-friendly choices, and verifies authenticity to reduce fraud.

---

## Features

- **Loyalty tokens** earned on bookings, redeemable across a network of providers  
- **Decentralized reservations** with smart contract-enforced cancellations and refunds  
- **Verifiable identities** using blockchain for quick border crossings and personalized services  
- **Tokenized experiences** as NFTs for collectible virtual or physical tours with resale royalties  
- **Sustainable incentives** by rewarding low-carbon travel options via tokens  
- **Transparent reviews** integrated into bookings for trust without central control  
- **Cross-border payments** in stablecoins or tokens, bypassing currency conversion fees  

---

## Smart Contracts

### Travel Token Contract
- Mint, burn, and transfer loyalty tokens (e.g., based on booking value or sustainable actions)
- Staking for additional rewards or governance participation
- Integration with bookings for automatic reward distribution

### Booking Contract
- Create and confirm reservations using smart contracts for hotels, flights, or tours
- Automated payments, refunds, and dispute resolution via escrow
- Availability checks and overbooking prevention through on-chain logic

### Identity Verification Contract
- Store hashed traveler data (e.g., passports or KYC) for privacy-preserving verification
- Enable secure sharing with providers or authorities for seamless travel
- Integration with oracles for real-time compliance checks (e.g., visa status)

### Experience NFT Contract
- Mint NFTs representing unique experiences like guided tours or virtual reality explorations
- Enforce royalties on resales and track ownership history
- Dynamic metadata updates for experiences that evolve (e.g., seasonal events)

---

## Installation

1. Install [Clarinet CLI](https://docs.hiro.so/clarinet/getting-started)
2. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/decotravel.git
   ```
3. Run tests:
    ```bash
    npm test
    ```
4. Deploy contracts:
    ```bash
    clarinet deploy
    ```

## Usage

Each smart contract operates independently but integrates with others for a complete decentralized travel ecosystem.
Refer to individual contract documentation for function calls, parameters, and usage examples.

## License

MIT License