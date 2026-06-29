import pkg from '../../package.json';

export const environment = {
  production: true,
  stage: false,
  version: pkg.version,
  supabaseUrl: 'https://supaprod.mrsqm.com',
  supabaseAnonKey:
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDAyNTI4MCwiZXhwIjo0OTI5Njk4ODgwLCJyb2xlIjoiYW5vbiJ9._hmoQsHjrLHGaiAA4lBBZU7eBIo_avfO-OSssEGtsFY',
  gptServiceUrl: 'https://ai.mrsqm.com',
  notifierWsUrl: 'wss://notify.mrsqm.com',
};
