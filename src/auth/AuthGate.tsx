import { type ReactNode, useEffect, useState } from "react";
import { Alert, ActivityIndicator, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Household = { household_id: string; display_name: string; households: { name: string; invite_code: string } | null };

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHousehold = async (userId: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("household_members").select("household_id, display_name, households(name, invite_code)").eq("user_id", userId).maybeSingle();
    setHousehold((data as unknown as Household | null) ?? null);
  };

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadHousehold(data.session.user.id);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) loadHousehold(nextSession.user.id);
      else setHousehold(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!supabase) return <>{children}</>;
  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color="#6D5EF7" size="large" /><Text style={styles.loading}>Preparando tu hogar…</Text></SafeAreaView>;
  if (!session) return <AuthScreen />;
  if (!household) return <Onboarding onReady={() => loadHousehold(session.user.id)} onSignOut={() => supabase?.auth.signOut()} />;
  return <>{children}</>;
}

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!supabase || !email.trim() || password.length < 6) return Alert.alert("Revisa los datos", "Usa un correo válido y una contraseña de al menos 6 caracteres.");
    setBusy(true);
    const result = mode === "login" ? await supabase.auth.signInWithPassword({ email: email.trim(), password }) : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (result.error) return Alert.alert("No se pudo continuar", result.error.message);
    if (mode === "signup" && !result.data.session) Alert.alert("Confirma tu correo", "Supabase te envió un enlace. Ábrelo y luego inicia sesión en la app.");
  };

  return <SafeAreaView style={styles.safe}><View style={styles.authCard}><Text style={styles.brand}>FINANZAS EN PAREJA</Text><Text style={styles.title}>{mode === "login" ? "Bienvenidos" : "Crear acceso"}</Text><Text style={styles.subtitle}>Sus movimientos, categorías y decisiones en un solo lugar.</Text><TextInput autoCapitalize="none" keyboardType="email-address" placeholder="Correo electrónico" value={email} onChangeText={setEmail} style={styles.input} /><TextInput secureTextEntry placeholder="Contraseña" value={password} onChangeText={setPassword} style={styles.input} /><TouchableOpacity disabled={busy} onPress={submit} style={styles.primary}><Text style={styles.primaryText}>{busy ? "Procesando…" : mode === "login" ? "Ingresar" : "Crear mi acceso"}</Text></TouchableOpacity><TouchableOpacity onPress={() => setMode(mode === "login" ? "signup" : "login")}><Text style={styles.link}>{mode === "login" ? "¿Primera vez? Crear acceso" : "Ya tengo acceso"}</Text></TouchableOpacity></View></SafeAreaView>;
}

function Onboarding({ onReady, onSignOut }: { onReady: () => void; onSignOut: () => void }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [householdName, setHouseholdName] = useState("Nuestro hogar");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!supabase || !name.trim()) return Alert.alert("Falta tu nombre", "Indica cómo quieres aparecer en el hogar.");
    if (mode === "join" && code.trim().length < 6) return Alert.alert("Código incompleto", "Escribe el código familiar que aparece en el otro teléfono.");
    setBusy(true);
    const { data, error } = mode === "create" ? await supabase.rpc("create_household", { household_name: householdName.trim() || "Nuestro hogar", member_name: name.trim() }) : await supabase.rpc("join_household", { code: code.trim(), member_name: name.trim() });
    setBusy(false);
    if (error) return Alert.alert("No se pudo continuar", error.message);
    if (mode === "create") {
      const row = Array.isArray(data) ? data[0] : data;
      Alert.alert("Hogar creado", `Código para tu pareja: ${row?.invite_code ?? "Disponible en ajustes"}`, [{ text: "Continuar", onPress: onReady }]);
    } else onReady();
  };

  return <SafeAreaView style={styles.safe}><View style={styles.authCard}><Text style={styles.brand}>CUENTA COMPARTIDA</Text><Text style={styles.title}>{mode === "create" ? "Crear nuestro hogar" : "Unirme al hogar"}</Text><Text style={styles.subtitle}>{mode === "create" ? "Tú recibirás un código para invitar a tu esposa." : "Usa el código creado en el primer teléfono."}</Text><TextInput placeholder="Tu nombre" value={name} onChangeText={setName} style={styles.input} />{mode === "create" ? <TextInput placeholder="Nombre del hogar" value={householdName} onChangeText={setHouseholdName} style={styles.input} /> : <TextInput autoCapitalize="characters" placeholder="Código familiar" value={code} onChangeText={setCode} style={styles.input} />}<TouchableOpacity disabled={busy} onPress={submit} style={styles.primary}><Text style={styles.primaryText}>{busy ? "Procesando…" : mode === "create" ? "Crear hogar" : "Unirme"}</Text></TouchableOpacity><TouchableOpacity onPress={() => setMode(mode === "create" ? "join" : "create")}><Text style={styles.link}>{mode === "create" ? "Ya existe: usar código" : "Crear un hogar nuevo"}</Text></TouchableOpacity><TouchableOpacity onPress={onSignOut}><Text style={styles.signOut}>Cerrar sesión</Text></TouchableOpacity></View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F7FB", justifyContent: "center", padding: 22 }, center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F6F7FB" }, loading: { marginTop: 12, color: "#697084" }, authCard: { backgroundColor: "white", borderRadius: 28, padding: 24, shadowColor: "#17203A", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }, brand: { color: "#6D5EF7", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 }, title: { color: "#17203A", fontSize: 30, fontWeight: "900", marginTop: 8 }, subtitle: { color: "#7E8598", lineHeight: 20, marginTop: 7, marginBottom: 22 }, input: { backgroundColor: "#F6F7FB", borderWidth: 1, borderColor: "#E7E9F0", borderRadius: 15, paddingHorizontal: 15, paddingVertical: 14, marginBottom: 12, color: "#17203A" }, primary: { backgroundColor: "#6D5EF7", borderRadius: 15, paddingVertical: 15, alignItems: "center", marginTop: 4 }, primaryText: { color: "white", fontWeight: "900" }, link: { color: "#6D5EF7", fontWeight: "700", textAlign: "center", marginTop: 18 }, signOut: { color: "#A1A6B3", textAlign: "center", marginTop: 20 }
});
