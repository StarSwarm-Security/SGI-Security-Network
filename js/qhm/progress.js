// Privacy + quantum upgrade progress: an ESTIMATE from three documented factors.
// Not a measurement, rating or advice. Unknown stays unknown and adds 0 points.
// Migration status notes summarise public chain profiles and project posts as of Oct 2026
// (main reference: hardyindex.com chain profiles). Re-check before relying on any of it.
export function installProgress(global = {}) {
  const W = { pq: 50, exposure: 35, privacy: 15 };
  const PQ = {
    live:      { v: 90, label: 'Live on mainnet (opt-in)' },
    contracts: { v: 65, label: 'Live via contracts or wallets, not the protocol' },
    committed: { v: 45, label: 'Published roadmap or testnet work' },
    draft:     { v: 20, label: 'Drafts or research only' },
    none:      { v: 0,  label: 'No published plan found' }
  };
  const EXPOSURE = {
    utxo:    { v: 60, label: 'Hashed addresses, key hidden until spent' },
    account: { v: 30, label: 'Key visible after the first send' },
    pubkey:  { v: 10, label: 'Address is the public key, always visible' }
  };
  const PRIVACY = {
    default:  { v: 100, label: 'Private by default' },
    optional: { v: 50,  label: 'Optional shielded transfers' },
    mixing:   { v: 25,  label: 'Optional mixing or confidential extension' },
    none:     { v: 0,   label: 'Transparent ledger' }
  };
  // chain: [name, exposure, pq stage, pq note, privacy]
  const C = {
    bitcoin:   ['Bitcoin', 'utxo', 'draft', 'BIP-360 and BIP-361 are drafts with no agreed activation path.', 'none'],
    ethereum:  ['Ethereum', 'account', 'committed', 'Ethereum Foundation post-quantum team, interop devnets, core infrastructure targeted around 2029.', 'none'],
    bnb:       ['BNB Chain', 'account', 'draft', 'Tested ML-DSA-44 on its network and published the costs. No rollout plan.', 'none'],
    xrp:       ['XRP Ledger', 'account', 'committed', 'Dated roadmap to 2028, ML-DSA running on AlphaNet.', 'none'],
    solana:    ['Solana', 'pubkey', 'contracts', 'Opt-in Winternitz (hash-based) wallets live on mainnet. Protocol migration has no dates.', 'none'],
    tron:      ['Tron', 'account', 'committed', 'Falcon-512 active on the Nile testnet under a formal proposal.', 'none'],
    zcash:     ['Zcash', 'utxo', 'committed', 'ZIP 2005 adds a quantum recovery path for notes ahead of a full transition.', 'optional'],
    hyperliquid: ['Hyperliquid', 'account', 'none', 'No published post-quantum roadmap found.', 'none'],
    dogecoin:  ['Dogecoin', 'utxo', 'none', 'No published post-quantum roadmap.', 'none'],
    monero:    ['Monero', 'pubkey', 'draft', 'Research programme done and candidate schemes published, nothing deployed. One-time public keys are on-chain.', 'default'],
    cardano:   ['Cardano', 'utxo', 'committed', 'Post-quantum is a strategic pillar in Cardano Vision 2026 with named research deliverables.', 'none'],
    near:      ['NEAR', 'pubkey', 'live', 'ML-DSA-65 accounts on mainnet since the 2.13 release (July 2026). Holders can rotate keys.', 'none'],
    stellar:   ['Stellar', 'pubkey', 'committed', 'Quantum Preparedness Plan, stage 1 adds ML-DSA verification to Soroban.', 'none'],
    bch:       ['Bitcoin Cash', 'utxo', 'contracts', 'Hash-based post-quantum vaults run as contracts since the May 2026 upgrade.', 'none'],
    litecoin:  ['Litecoin', 'utxo', 'none', 'No published post-quantum roadmap.', 'mixing'],
    avalanche: ['Avalanche', 'account', 'none', 'No published post-quantum roadmap found.', 'none'],
    sui:       ['Sui', 'account', 'committed', 'Committed to NIST schemes (Aug 2026), testnet ML-DSA accounts, mainnet targeted Q1 2027.', 'none'],
    ton:       ['TON', 'pubkey', 'none', 'No published roadmap, though wallet contracts could adopt a new scheme.', 'none'],
    hedera:    ['Hedera', 'pubkey', 'committed', 'Phased roadmap (Apr 2026) targets a post-quantum key type in 2027.', 'none'],
    polkadot:  ['Polkadot', 'pubkey', 'committed', 'Web3 Foundation roadmap names Dilithium for consensus and Falcon for accounts.', 'none'],
    bittensor: ['Bittensor', 'pubkey', 'none', 'No published post-quantum position of its own.', 'none'],
    algorand:  ['Algorand', 'pubkey', 'live', 'Falcon state proofs since 2022, native Falcon-1024 accounts since Aug 2026.', 'none'],
    kaspa:     ['Kaspa', 'pubkey', 'draft', 'Draft proposal to hide keys and testnet experiments, no scheme agreed.', 'none'],
    cosmos:    ['Cosmos Hub', 'account', 'draft', 'Cosmos SDK ships ML-DSA keys, the Hub has not upgraded or published a plan.', 'none'],
    icp:       ['Internet Computer', 'account', 'none', 'No published post-quantum programme.', 'none'],
    etc:       ['Ethereum Classic', 'account', 'none', 'Only an unsubmitted outside draft.', 'none'],
    filecoin:  ['Filecoin', 'account', 'none', 'No post-quantum proposal or plan found.', 'none'],
    vechain:   ['VeChain', 'account', 'none', 'No post-quantum proposal or plan found.', 'none'],
    polygon:   ['Polygon PoS', 'account', 'none', 'No post-quantum proposal or plan found.', 'none'],
    injective: ['Injective', 'account', 'none', 'Posts say work is in progress, no scheme or date.', 'none'],
    gatechain: ['GateChain', 'account', 'none', 'No post-quantum plan found.', 'none'],
    kcc:       ['KCC', 'account', 'none', 'No post-quantum plan found.', 'none'],
    whitechain:['Whitechain', 'account', 'none', 'No post-quantum plan found.', 'none'],
    cronos:    ['Cronos', 'account', 'none', 'No published post-quantum position.', 'none'],
    memecore:  ['MemeCore', 'account', 'none', 'No published post-quantum position.', 'none'],
    xdc:       ['XDC Network', 'account', 'draft', 'Falcon tested on an unmerged branch, roadmap not adopted by governance.', 'none'],
    aptos:     ['Aptos', 'account', 'committed', 'AIP-137 opt-in SLH-DSA accounts accepted and on devnet, no mainnet date.', 'none'],
    dash:      ['Dash', 'utxo', 'none', 'No post-quantum proposal.', 'mixing'],
    midnight:  ['Midnight', null, 'none', 'No published post-quantum plan.', 'optional']
  };
  // CoinGecko id -> chain (native coin or the chain a token is scored on)
  const T = {
    bitcoin: 'bitcoin', ethereum: 'ethereum', binancecoin: 'bnb', ripple: 'xrp', 'ripple-usd': 'xrp', solana: 'solana',
    tron: 'tron', usdd: 'tron', just: 'tron', zcash: 'zcash', hyperliquid: 'hyperliquid', dogecoin: 'dogecoin',
    monero: 'monero', cardano: 'cardano', near: 'near', stellar: 'stellar', 'bitcoin-cash': 'bch', litecoin: 'litecoin',
    'avalanche-2': 'avalanche', sui: 'sui', 'the-open-network': 'ton', 'hedera-hashgraph': 'hedera', polkadot: 'polkadot',
    bittensor: 'bittensor', algorand: 'algorand', kaspa: 'kaspa', cosmos: 'cosmos', 'internet-computer': 'icp',
    'ethereum-classic': 'etc', filecoin: 'filecoin', vechain: 'vechain', 'polygon-ecosystem-token': 'polygon',
    'injective-protocol': 'injective', 'gatechain-token': 'gatechain', 'kucoin-shares': 'kcc', whitebit: 'whitechain',
    'crypto-com-chain': 'cronos', memecore: 'memecore', 'xdce-crowd-sale': 'xdc', aptos: 'aptos', dash: 'dash',
    'midnight-3': 'midnight', 'pump-fun': 'solana', 'jupiter-exchange-solana': 'solana', 'render-token': 'solana',
    'pancakeswap-token': 'bnb', 'aster-2': 'bnb'
  };
  ('tether usd-coin usds ethena-usde dai uniswap chainlink leo-token shiba-inu ethena aave ondo-finance pepe worldcoin-wld ' +
   'pax-gold tether-gold paypal-usd sky morpho quant-network usd1-wlfi global-dollar world-liberty-financial gho ether-fi ' +
   'layerzero nexo okb bitget-token htx-dao mantle arbitrum aerodrome-finance wrapped-bitcoin')
    .split(' ').forEach(id => { T[id] = 'ethereum'; });

  global.QHM_PROGRESS = function (coin) {
    const key = T[coin.id], c = key && C[key];
    if (!c) return { known: false, score: null, chain: null, factors: [
      { name: 'Post-quantum migration', status: 'Unknown', note: 'Chain not classified yet.', pts: null, max: W.pq },
      { name: 'Key exposure', status: 'Unknown', note: '', pts: null, max: W.exposure },
      { name: 'Privacy', status: 'Unknown', note: '', pts: null, max: W.privacy }] };
    const native = ['bitcoin','ethereum','binancecoin','ripple','solana','tron','zcash','hyperliquid','dogecoin','monero','cardano','near','stellar','bitcoin-cash','litecoin','avalanche-2','sui','the-open-network','hedera-hashgraph','polkadot','bittensor','algorand','kaspa','cosmos','internet-computer','ethereum-classic','filecoin','vechain','aptos','dash','midnight-3','memecore','xdce-crowd-sale','injective-protocol','polygon-ecosystem-token','gatechain-token','kucoin-shares','whitebit','crypto-com-chain'].includes(coin.id);
    const pq = PQ[c[2]], ex = c[1] ? EXPOSURE[c[1]] : null, pv = PRIVACY[c[4]];
    const f = [
      { name: 'Post-quantum migration', status: pq.label, note: c[3], pts: Math.round(pq.v * W.pq / 100), max: W.pq },
      { name: 'Key exposure', status: ex ? ex.label : 'Unknown', note: ex ? '' : 'Not documented here, adds 0.', pts: ex ? Math.round(ex.v * W.exposure / 100) : null, max: W.exposure },
      { name: 'Privacy', status: pv.label, note: '', pts: Math.round(pv.v * W.privacy / 100), max: W.privacy }
    ];
    const score = f.reduce((a, x) => a + (x.pts || 0), 0);
    return { known: true, score, chain: c[0], native, factors: f };
  };
return global.QHM_PROGRESS;
}
