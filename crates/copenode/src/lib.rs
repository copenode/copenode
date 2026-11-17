//! copenode — architectural foundation and node orchestration platform.
//!
//! Autonomy engineered around systemic stability.
//!
//! This crate reserves the Rust name for the copenode project. The active
//! code lives in the TypeScript monorepo:
//!
//! - npm: [`@copenode/core`](https://www.npmjs.com/package/@copenode/core) —
//!   identity mapping, trust-tier routing, the metering ledger
//! - repo: <https://github.com/copenode/copenode>
//! - web: <https://copenode.com>
//!
//! Rust nodes and protocol taps (AG-UI, MCP, A2A) will live here when the
//! platform's protocol lane needs them. Until then: sovereign nodes, light
//! center — copenode orchestrates, it never replaces.

/// The reserved crate's version, mirroring the project's reservation series.
pub const RESERVED_VERSION: &str = "0.0.1";

#[cfg(test)]
mod tests {
    #[test]
    fn reserves_the_name() {
        assert!(!super::RESERVED_VERSION.is_empty());
    }
}
