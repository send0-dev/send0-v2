/** Fixed advisory-lock key ("send0" + "mig" in ASCII hex) so concurrent boots migrate one at a time. Shared by every migrator. */
export const MIGRATION_LOCK_ID = 0x73656e6430_6d6967n;
