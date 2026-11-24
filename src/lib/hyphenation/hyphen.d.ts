// Das Paket `hyphen` bringt keine eigenen Typen mit. Genutzt wird nur die
// synchrone Trennung mit den deutschen Mustern (neue Rechtschreibung). Das Paket
// ist CommonJS: Je nach Bundler kommen die Funktionen benannt oder als `default`.
declare module "hyphen/de-1996" {
  type Options = { hyphenChar?: string; minWordLength?: number; html?: boolean; exceptions?: string[] };
  export function hyphenateSync(text: string, options?: Options): string;
  const api: { hyphenateSync: (text: string, options?: Options) => string };
  export default api;
}
