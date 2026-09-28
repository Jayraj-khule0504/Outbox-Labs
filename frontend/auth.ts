import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  providers: [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })],
  pages: { signIn: "/" },
  callbacks: { jwt({ token, profile }) { if (profile?.sub) token.sub = profile.sub; return token; }, session({ session, token }) { if (session.user) session.user.id = token.sub || ""; return session; } }
});
