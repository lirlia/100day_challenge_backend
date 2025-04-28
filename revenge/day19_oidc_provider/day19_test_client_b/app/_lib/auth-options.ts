import { AuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";

export const authOptions: AuthOptions = {
  providers: [
    {
      id: "oidc-provider",
      name: "OIDC Provider",
      type: "oauth",
      wellKnown: "http://localhost:8080/.well-known/openid-configuration",
      authorization: { params: { scope: "openid email profile" } },
      clientId: "client-b",
      clientSecret: "client-b-secret",
      idToken: true,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign in
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.expiresAt = Math.floor(Date.now() / 1000 + (account.expires_in as number));
        token.refreshToken = account.refresh_token;
      }
      // Return previous token if the access token has not expired yet
      if (token.expiresAt && Date.now() < token.expiresAt * 1000) {
        return token;
      }
      // Access token has expired, try to refresh it
      // In this demo, we don't implement refresh tokens
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.idToken = token.idToken as string;
      return session;
    },
  },
  debug: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
};
