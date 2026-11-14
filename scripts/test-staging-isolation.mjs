// Fixed staging target. Tokens are supplied only through the execution environment.
const STAGING_URL='https://bzpiosxlhdvsnzxpmqfq.supabase.co';
const PUBLIC_KEY='sb_publishable_f6NfJwi1yCcVs_QX7IIR_g_IVnqkwvh';
if(process.env.MM_TEST_SUPABASE_URL&&process.env.MM_TEST_SUPABASE_URL!==STAGING_URL){
 console.error('Refusing test: this runner only targets the existing staging project.');process.exit(2);
}
process.env.MM_TEST_SUPABASE_URL=STAGING_URL;
process.env.MM_TEST_PUBLIC_KEY=PUBLIC_KEY;
if(!process.env.MM_TEST_TOKEN_A||!process.env.MM_TEST_TOKEN_B){
 console.error('Not run: configure MM_TEST_TOKEN_A and MM_TEST_TOKEN_B for TWO DISPOSABLE, verified staging accounts in environment settings. Never paste tokens into chat. No database writes were attempted.');process.exit(2);
}
process.argv.push('--disposable-accounts');
await import('./test-account-isolation.mjs');
