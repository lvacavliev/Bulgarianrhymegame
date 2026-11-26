/* Rimoboy party mode: Supabase connection (BUILD.md section 16.3 / 16.9).
   The publishable key is public by design: Row Level Security (party/schema.sql) protects
   the data. Never put the service_role / secret key here.
   base = the public site the QR code points to. When the game runs from the deployed https
   site, location.origin is used instead; base is the fallback for localhost (start.bat). */
window.RB_PARTY = {
  url: 'https://gpjwptfyvcvlwvfbsprv.supabase.co',
  key: 'sb_publishable_Vka4312zTSVyXVgMXQOMGg_iyjsRxV2',
  base: 'https://bulgarianrhymegame.vercel.app',
};
