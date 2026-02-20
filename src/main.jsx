import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { supabase } from "./supabase.js";
import { ThemeProvider } from "./ThemeContext.jsx";
import AuthPage from "./AuthPage.jsx";
import EditorOnboarding from "./EditorOnboarding.jsx";
import App from "./App.jsx";
import { isOnboardingComplete } from "./editorProfiles.js";
import "./styles.css";

function Root() {
  const [session, setSession] = useState(undefined);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="loading-screen">
        <div className="loading-dot" />
      </div>
    );
  }

  if (!session) {
    return <AuthPage onAuth={setSession} />;
  }

  const userMeta = session.user?.user_metadata || {};
  const role = userMeta.role || "founder";
  const email = session.user?.email || "";
  const displayName = userMeta.display_name || email.split("@")[0] || "User";

  // Editors must complete onboarding before accessing the app
  if (role === "editor" && !onboarded && !isOnboardingComplete(email)) {
    return <EditorOnboarding email={email} displayName={displayName} onComplete={(name) => {
      setOnboarded(true);
    }} />;
  }

  return <App session={session} userRole={role} userName={displayName} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </React.StrictMode>
);
