import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./src/lib/supabase";
import { AuthGate, useHousehold } from "./src/auth/AuthGate";
import {
  Alert,
  AppState,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

type Movement = {
  id: string;
  title: string;
  detail: string;
  amount: number;
  category: string | null;
  color: string;
  day: string;
  occurredAt: string;
  categoryId?: string | null;
  source?: "remote" | "local";
};

type RemoteCategory = { id: string; name: string };

const movements: Movement[] = [
  { id: "1", title: "Farmacorp", detail: "Transferencia ACH · Hoy, 19:23", amount: -130.95, category: "Salud", color: "#6D5EF7", day: "03", occurredAt: "2026-09-03T19:23:12-04:00" },
  { id: "2", title: "Ingreso ACH", detail: "Transferencia recibida · 16 ago", amount: 1, category: null, color: "#E8A838", day: "16", occurredAt: "2026-08-16T22:38:55-04:00" },
  { id: "3", title: "Hipermaxi Achumani", detail: "Compra POS · 7 jul", amount: -178.43, category: "Supermercado", color: "#20A477", day: "07", occurredAt: "2026-07-07T19:22:07-04:00" },
  { id: "4", title: "Retiro en cajero", detail: "ATM · 1 jul", amount: -500, category: "Efectivo", color: "#EF6A6A", day: "01", occurredAt: "2026-07-01T15:51:02-04:00" }
];

const requestedCategories = [
  "Alimentación",
  "Servicios básicos",
  "Impuestos",
  "Gasolina",
  "Suscripciones"
];

const initialCategories = [
  "Vivienda",
  "Supermercado",
  "Salud",
  "Transporte",
  "Efectivo",
  "Entretenimiento",
  ...requestedCategories
];

const STORAGE_MOVEMENTS = "finanzas:movements:v1";
const STORAGE_CATEGORIES = "finanzas:categories:v1";

const money = (amount: number) => `${amount < 0 ? "−" : "+"} Bs ${Math.abs(amount).toFixed(2)}`;

function FinanceApp() {
  const household = useHousehold();
  const [activeTab, setActiveTab] = useState<"inicio" | "movimientos" | "categorias" | "ajustes">("inicio");
  const [period, setPeriod] = useState("Este mes");
  const [savedMovements, setSavedMovements] = useState<Movement[]>(movements);
  const [categories, setCategories] = useState(initialCategories);
  const [movementFilter, setMovementFilter] = useState<"all" | "income" | "expense">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [remoteCategories, setRemoteCategories] = useState<RemoteCategory[]>([]);

  const mapTransaction = (row: any): Movement => {
    const channel = String(row.channel ?? "manual").toUpperCase();
    const title = row.description || row.counterparty || (row.kind === "income" ? "Ingreso" : "Gasto");
    return {
      id: row.id,
      title,
      detail: `${channel} · ${new Date(row.occurred_at).toLocaleDateString("es-BO", { day: "numeric", month: "short" })}`,
      amount: row.kind === "income" ? Number(row.amount) : -Number(row.amount),
      category: row.categories?.name ?? null,
      categoryId: row.category_id,
      color: "#6D5EF7",
      day: String(new Date(row.occurred_at).getDate()).padStart(2, "0"),
      occurredAt: row.occurred_at,
      source: "remote"
    };
  };

  const loadRemoteData = async (showError = false) => {
    if (!supabase || !household) return false;
    const [categoryResult, transactionResult] = await Promise.all([
      supabase.from("categories").select("id, name").eq("household_id", household.householdId).is("archived_at", null).order("name"),
      supabase.from("transactions").select("id, category_id, kind, amount, occurred_at, description, counterparty, channel, categories(name)").eq("household_id", household.householdId).order("occurred_at", { ascending: false })
    ]);
    const error = categoryResult.error ?? transactionResult.error;
    if (error) {
      setConnectionStatus("offline");
      if (showError) Alert.alert("Sin conexión", "No pudimos sincronizar los movimientos. Conservamos la información disponible en este teléfono.");
      return false;
    }
    const categoryRows = (categoryResult.data ?? []) as RemoteCategory[];
    setRemoteCategories(categoryRows);
    setCategories(categoryRows.map((item) => item.name));
    setSavedMovements((transactionResult.data ?? []).map(mapTransaction));
    setConnectionStatus("connected");
    return true;
  };

  useEffect(() => {
    if (!supabase || !household) {
      setConnectionStatus("offline");
      return;
    }
    loadRemoteData(true);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") loadRemoteData();
    });
    return () => subscription.remove();
  }, [household?.householdId]);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(STORAGE_MOVEMENTS), AsyncStorage.getItem(STORAGE_CATEGORIES)])
      .then(([storedMovements, storedCategories]) => {
        if (storedMovements && (!supabase || !household)) {
          const parsed = JSON.parse(storedMovements) as Movement[];
          setSavedMovements(parsed.map((item) => ({ ...item, occurredAt: item.occurredAt ?? "2026-09-01T12:00:00-04:00" })));
        }
        if (storedCategories && (!supabase || !household)) {
          const stored = JSON.parse(storedCategories) as string[];
          setCategories(Array.from(new Set([...stored, ...requestedCategories])));
        }
      })
      .catch(() => Alert.alert("Aviso", "No se pudieron recuperar los datos locales."));
  }, [household?.householdId]);

  useEffect(() => { AsyncStorage.setItem(STORAGE_MOVEMENTS, JSON.stringify(savedMovements)); }, [savedMovements]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_CATEGORIES, JSON.stringify(categories)); }, [categories]);

  const periodMovements = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    if (period === "Este mes") start.setDate(1);
    else if (period === "3 meses") start.setMonth(now.getMonth() - 2, 1);
    else start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return savedMovements.filter((item) => new Date(item.occurredAt) >= start && new Date(item.occurredAt) <= now);
  }, [savedMovements, period]);
  const totals = useMemo(() => ({
    income: periodMovements.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0),
    expense: Math.abs(periodMovements.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0))
  }), [periodMovements]);
  const filteredMovements = useMemo(() => savedMovements.filter((item) => {
    const matchesKind = movementFilter === "all" || (movementFilter === "income" ? item.amount > 0 : item.amount < 0);
    return matchesKind && (!categoryFilter || item.category === categoryFilter);
  }), [savedMovements, movementFilter, categoryFilter]);
  const categorySummary = useMemo(() => {
    const palette = ["#6D5EF7", "#20A477", "#E8A838", "#EF6A6A", "#4C91E8"];
    const totalsByCategory = new Map<string, number>();
    periodMovements.filter((item) => item.amount < 0).forEach((item) => {
      const name = item.category ?? "Sin clasificar";
      totalsByCategory.set(name, (totalsByCategory.get(name) ?? 0) + Math.abs(item.amount));
    });
    const total = Array.from(totalsByCategory.values()).reduce((sum, value) => sum + value, 0);
    return Array.from(totalsByCategory.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value], index) => ({ name, value, percentage: total ? Math.round(value / total * 100) : 0, color: palette[index] ?? "#64748B" }));
  }, [periodMovements]);
  const pendingCount = savedMovements.filter((item) => !item.category).length;

  const openMovement = (movement: Movement | null = null) => {
    setEditingMovement(movement);
    setMovementModalOpen(true);
  };

  const saveMovement = async (movement: Movement) => {
    if (!supabase || !household) {
      setSavedMovements((current) => editingMovement ? current.map((item) => item.id === editingMovement.id ? movement : item) : [movement, ...current]);
      setMovementModalOpen(false);
      return;
    }
    const categoryId = movement.category ? remoteCategories.find((item) => item.name === movement.category)?.id ?? null : null;
    const values = {
      household_id: household.householdId,
      category_id: categoryId,
      kind: movement.amount > 0 ? "income" : "expense",
      status: categoryId ? "classified" : "pending",
      amount: Math.abs(movement.amount),
      occurred_at: movement.occurredAt,
      description: movement.title,
      channel: editingMovement ? undefined : "manual",
      source: editingMovement ? undefined : "manual",
      created_by: editingMovement ? undefined : household.userId,
      updated_at: new Date().toISOString()
    };
    const result = editingMovement
      ? await supabase.from("transactions").update(values).eq("id", editingMovement.id).eq("household_id", household.householdId)
      : await supabase.from("transactions").insert(values);
    if (result.error) return Alert.alert("No se pudo guardar", result.error.message);
    setMovementModalOpen(false);
    await loadRemoteData();
  };

  const deleteMovement = (movement: Movement) => Alert.alert(
    "Eliminar movimiento",
    `¿Quieres eliminar “${movement.title}”? Esta acción no se puede deshacer.`,
    [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: async () => {
      if (supabase && household && movement.source === "remote") {
        const { error } = await supabase.from("transactions").delete().eq("id", movement.id).eq("household_id", household.householdId);
        if (error) return Alert.alert("No se pudo eliminar", error.message);
      }
      setSavedMovements((current) => current.filter((item) => item.id !== movement.id));
      setMovementModalOpen(false);
    } }]
  );

  const deleteCategory = (name: string) => Alert.alert(
    "Eliminar categoría",
    `Los movimientos de “${name}” quedarán pendientes de clasificación.`,
    [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: async () => {
      const remote = remoteCategories.find((item) => item.name === name);
      if (supabase && household && remote) {
        const { error: movementError } = await supabase.from("transactions").update({ category_id: null, status: "pending", updated_at: new Date().toISOString() }).eq("household_id", household.householdId).eq("category_id", remote.id);
        if (movementError) return Alert.alert("No se pudo actualizar", movementError.message);
        const { error } = await supabase.from("categories").delete().eq("id", remote.id).eq("household_id", household.householdId);
        if (error) return Alert.alert("No se pudo eliminar", error.message);
      }
      setRemoteCategories((current) => current.filter((item) => item.name !== name));
      setCategories((current) => current.filter((item) => item !== name));
      setSavedMovements((current) => current.map((item) => item.category === name ? { ...item, category: null, categoryId: null } : item));
      if (categoryFilter === name) setCategoryFilter(null);
    } }]
  );

  const createCategory = async (name: string) => {
    if (categories.some((item) => item.toLowerCase() === name.toLowerCase())) {
      setCategoryModalOpen(false);
      return;
    }
    if (supabase && household) {
      const { data, error } = await supabase.from("categories").insert({ household_id: household.householdId, name }).select("id, name").single();
      if (error) return Alert.alert("No se pudo crear", error.message);
      setRemoteCategories((current) => [...current, data as RemoteCategory]);
    }
    setCategories((current) => [...current, name]);
    setCategoryModalOpen(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>{(household?.householdName ?? "NUESTRO HOGAR").toUpperCase()}</Text>
              <Text style={styles.greeting}>Hola, {household?.displayName ?? "Martin"}</Text>
            </View>
            <TouchableOpacity style={styles.avatar}><Text style={styles.avatarText}>MC</Text></TouchableOpacity>
          </View>

          {activeTab === "inicio" && (
            <>
              <View style={styles.periodRow}>
                {["Este mes", "3 meses", "Año"].map((item) => (
                  <TouchableOpacity key={item} onPress={() => setPeriod(item)} style={[styles.periodPill, period === item && styles.periodPillActive]}>
                    <Text style={[styles.periodText, period === item && styles.periodTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.balanceCard}>
                <Text style={styles.cardLabel}>BALANCE DISPONIBLE</Text>
                <Text style={styles.balance}>Bs {(totals.income - totals.expense).toLocaleString("es-BO", { minimumFractionDigits: 2 })}</Text>
                <Text style={styles.balanceCaption}>{period}</Text>
                <View style={styles.divider} />
                <View style={styles.totalsRow}>
                  <View style={styles.totalBlock}><Text style={styles.totalDotIncome}>↑</Text><View><Text style={styles.totalLabel}>Ingresos</Text><Text style={styles.totalValue}>Bs {totals.income.toLocaleString("es-BO", { minimumFractionDigits: 2 })}</Text></View></View>
                  <View style={styles.totalBlock}><Text style={styles.totalDotExpense}>↓</Text><View><Text style={styles.totalLabel}>Gastos</Text><Text style={styles.totalValue}>Bs {totals.expense.toLocaleString("es-BO", { minimumFractionDigits: 2 })}</Text></View></View>
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <View><Text style={styles.sectionTitle}>Gastos por categoría</Text><Text style={styles.sectionHint}>Cómo se distribuye el mes</Text></View>
                <TouchableOpacity style={styles.filterButton}><Text style={styles.filterText}>Filtrar</Text></TouchableOpacity>
              </View>

              <View style={styles.categoryCard}>
                {categorySummary.length ? <><View style={styles.barTrack}>{categorySummary.map((item, index) => <View key={item.name} style={[styles.barPart, { flex: item.percentage || 1, backgroundColor: item.color, borderTopLeftRadius: index === 0 ? 6 : 0, borderBottomLeftRadius: index === 0 ? 6 : 0, borderTopRightRadius: index === categorySummary.length - 1 ? 6 : 0, borderBottomRightRadius: index === categorySummary.length - 1 ? 6 : 0 }]} />)}</View>
                {categorySummary.map((item) => (
                  <View key={item.name} style={styles.categoryRow}>
                    <View style={[styles.categoryDot, { backgroundColor: item.color }]} />
                    <Text style={styles.categoryName}>{item.name}</Text>
                    <Text style={styles.categoryPercent}>{item.percentage}%</Text>
                    <Text style={styles.categoryValue}>Bs {item.value.toLocaleString("es-BO", { minimumFractionDigits: 2 })}</Text>
                  </View>
                ))}</> : <Text style={styles.emptyText}>No hay gastos en este período.</Text>}
              </View>

              <View style={styles.sectionHeader}>
                <View><Text style={styles.sectionTitle}>Movimientos recientes</Text><Text style={styles.sectionHint}>Actualizados desde el banco</Text></View>
                <TouchableOpacity onPress={() => setActiveTab("movimientos")}><Text style={styles.link}>Ver todos</Text></TouchableOpacity>
              </View>
              <MovementList items={savedMovements.slice(0, 3)} onSelect={openMovement} />
            </>
          )}

          {activeTab === "movimientos" && (
            <>
              <Text style={styles.pageTitle}>Movimientos</Text>
              <Text style={styles.pageSubtitle}>Todos los ingresos y gastos de la cuenta compartida.</Text>
              {pendingCount > 0 && <TouchableOpacity style={styles.pendingBanner} onPress={() => openMovement(savedMovements.find((item) => !item.category) ?? null)}><Text style={styles.pendingIcon}>!</Text><View style={{ flex: 1 }}><Text style={styles.pendingTitle}>{pendingCount} movimiento{pendingCount === 1 ? "" : "s"} sin clasificar</Text><Text style={styles.pendingText}>Tócalo para agregar categoría y descripción.</Text></View></TouchableOpacity>}
              <View style={styles.chips}>{([['all', 'Todos'], ['income', 'Ingresos'], ['expense', 'Gastos']] as const).map(([key, label]) => <TouchableOpacity key={key} onPress={() => setMovementFilter(key)} style={movementFilter === key ? styles.chipActive : styles.chip}><Text style={movementFilter === key ? styles.chipActiveText : styles.chipText}>{label}</Text></TouchableOpacity>)}</View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryFilters}>
                <TouchableOpacity onPress={() => setCategoryFilter(null)} style={!categoryFilter ? styles.pickerChipActive : styles.pickerChip}><Text style={!categoryFilter ? styles.pickerChipTextActive : styles.pickerChipText}>Todas las categorías</Text></TouchableOpacity>
                {categories.map((item) => <TouchableOpacity key={item} onPress={() => setCategoryFilter(item)} style={categoryFilter === item ? styles.pickerChipActive : styles.pickerChip}><Text style={categoryFilter === item ? styles.pickerChipTextActive : styles.pickerChipText}>{item}</Text></TouchableOpacity>)}
              </ScrollView>
              <MovementList items={filteredMovements} onSelect={openMovement} />
              {!filteredMovements.length && <Text style={styles.emptyText}>No hay movimientos con estos filtros.</Text>}
            </>
          )}

          {activeTab === "categorias" && (
            <>
              <Text style={styles.pageTitle}>Categorías</Text>
              <Text style={styles.pageSubtitle}>Organicen los movimientos de una forma que tenga sentido para ustedes.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setCategoryModalOpen(true)}><Text style={styles.primaryButtonText}>＋ Nueva categoría</Text></TouchableOpacity>
              <View style={styles.categoryCard}>
                {categories.map((name, index) => (
                  <TouchableOpacity key={name} onPress={() => Alert.alert(name, "¿Qué quieres hacer?", [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: () => deleteCategory(name) }])} style={styles.manageCategoryRow}><View style={[styles.categoryIcon, { backgroundColor: ["#EEEAFE", "#E4F7F0", "#FCECEE", "#FFF4D9"][index % 4] }]}><Text>{["⌂", "▣", "+", "↗"][index % 4]}</Text></View><Text style={styles.manageCategoryName}>{name}</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {activeTab === "ajustes" && (
            <>
              <Text style={styles.pageTitle}>Ajustes</Text>
              <Text style={styles.pageSubtitle}>Estado de la cuenta familiar y sus servicios.</Text>
              <View style={styles.settingsCard}>
                <View style={styles.settingRow}>
                  <View style={[styles.statusDot, connectionStatus === "connected" ? styles.statusConnected : styles.statusOffline]} />
                  <View style={{ flex: 1 }}><Text style={styles.settingTitle}>Supabase</Text><Text style={styles.settingHint}>{connectionStatus === "checking" ? "Comprobando conexión…" : connectionStatus === "connected" ? "Conectado y protegido" : isSupabaseConfigured ? "Sin conexión; usando modo local" : "Pendiente de configurar"}</Text></View>
                  <Text style={styles.settingState}>{connectionStatus === "connected" ? "Activo" : "Local"}</Text>
                </View>
                <View style={styles.settingRow}>
                  <View style={[styles.statusDot, styles.statusPending]} />
                  <View style={{ flex: 1 }}><Text style={styles.settingTitle}>Cuenta familiar</Text><Text style={styles.settingHint}>{household?.householdName ?? "Disponible solo en este teléfono"}</Text></View>
                  <Text style={styles.settingState}>{household ? "Activo" : "Local"}</Text>
                </View>
                <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
                  <View style={[styles.statusDot, styles.statusPending]} />
                  <View style={{ flex: 1 }}><Text style={styles.settingTitle}>Correo bancario</Text><Text style={styles.settingHint}>Revisión automática cada 30 minutos.</Text></View>
                  <Text style={styles.settingState}>Activo</Text>
                </View>
              </View>
            </>
          )}
          <View style={{ height: 110 }} />
        </ScrollView>

        <View style={styles.nav}>
          <NavItem label="Inicio" symbol="⌂" active={activeTab === "inicio"} onPress={() => setActiveTab("inicio")} />
          <NavItem label="Movimientos" symbol="↕" active={activeTab === "movimientos"} onPress={() => setActiveTab("movimientos")} />
          <TouchableOpacity style={styles.addButton} onPress={() => openMovement()}><Text style={styles.addButtonText}>＋</Text></TouchableOpacity>
          <NavItem label="Categorías" symbol="◈" active={activeTab === "categorias"} onPress={() => setActiveTab("categorias")} />
          <NavItem label="Ajustes" symbol="⚙" active={activeTab === "ajustes"} onPress={() => setActiveTab("ajustes")} />
        </View>
        <MovementEditor
          visible={movementModalOpen}
          movement={editingMovement}
          categories={categories}
          onClose={() => setMovementModalOpen(false)}
          onSave={saveMovement}
          onDelete={editingMovement ? () => deleteMovement(editingMovement) : undefined}
        />
        <CategoryEditor visible={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} onSave={createCategory} />
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return <AuthGate><FinanceApp /></AuthGate>;
}

function MovementList({ items, onSelect }: { items: Movement[]; onSelect: (movement: Movement) => void }) {
  return <View style={styles.movementCard}>{items.map((item, index) => (
    <TouchableOpacity key={item.id} onPress={() => onSelect(item)} style={[styles.movementRow, index < items.length - 1 && styles.movementBorder]}>
      <View style={styles.dateBox}><Text style={styles.dateDay}>{String(new Date(item.occurredAt).getDate()).padStart(2, "0")}</Text><Text style={styles.dateMonth}>{new Date(item.occurredAt).toLocaleDateString("es-BO", { month: "short" }).replace(".", "").toUpperCase()}</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.movementTitle}>{item.title}</Text><Text style={styles.movementDetail}>{item.detail}</Text><View style={[styles.tag, !item.category && styles.tagPending]}><Text style={[styles.tagText, !item.category && styles.tagPendingText]}>{item.category ?? "Clasificar"}</Text></View></View>
      <Text style={[styles.amount, item.amount > 0 && styles.income]}>{money(item.amount)}</Text>
    </TouchableOpacity>
  ))}</View>;
}

function MovementEditor({ visible, movement, categories, onClose, onSave, onDelete }: { visible: boolean; movement: Movement | null; categories: string[]; onClose: () => void; onSave: (movement: Movement) => void; onDelete?: () => void }) {
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    setKind(movement?.amount && movement.amount > 0 ? "income" : "expense");
    setAmount(movement ? String(Math.abs(movement.amount)) : "");
    setDescription(movement?.title ?? "");
    setCategory(movement?.category ?? null);
  }, [movement, visible]);

  const save = () => {
    const numericAmount = Number(amount.replace(",", "."));
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert("Faltan datos", "Ingresa una descripción y un importe válido.");
      return;
    }
    onSave({
      id: movement?.id ?? String(Date.now()),
      title: description.trim(),
      detail: movement?.detail ?? `Registro manual · ${new Date().toLocaleDateString("es-BO")}`,
      amount: kind === "income" ? numericAmount : -numericAmount,
      category,
      color: movement?.color ?? "#6D5EF7",
      day: movement?.day ?? String(new Date().getDate()).padStart(2, "0"),
      occurredAt: movement?.occurredAt ?? new Date().toISOString()
    });
  };

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.modalSafe}><ScrollView contentContainerStyle={styles.modalContent}>
      <View style={styles.modalHeader}><TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Cancelar</Text></TouchableOpacity><Text style={styles.modalTitle}>{movement ? "Editar movimiento" : "Nuevo movimiento"}</Text><TouchableOpacity onPress={save}><Text style={styles.modalSave}>Guardar</Text></TouchableOpacity></View>
      <Text style={styles.inputLabel}>TIPO</Text>
      <View style={styles.kindRow}><TouchableOpacity onPress={() => setKind("expense")} style={[styles.kindButton, kind === "expense" && styles.kindButtonExpense]}><Text style={[styles.kindText, kind === "expense" && styles.kindTextActive]}>Gasto</Text></TouchableOpacity><TouchableOpacity onPress={() => setKind("income")} style={[styles.kindButton, kind === "income" && styles.kindButtonIncome]}><Text style={[styles.kindText, kind === "income" && styles.kindTextActive]}>Ingreso</Text></TouchableOpacity></View>
      <Text style={styles.inputLabel}>IMPORTE EN BOLIVIANOS</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" style={styles.amountInput} />
      <Text style={styles.inputLabel}>DESCRIPCIÓN</Text><TextInput value={description} onChangeText={setDescription} placeholder="Ej. Supermercado semanal" style={styles.textInput} />
      <Text style={styles.inputLabel}>CATEGORÍA</Text><View style={styles.categoryPicker}>{categories.map((item) => <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[styles.pickerChip, category === item && styles.pickerChipActive]}><Text style={[styles.pickerChipText, category === item && styles.pickerChipTextActive]}>{item}</Text></TouchableOpacity>)}</View>
      {movement && <TouchableOpacity onPress={() => setCategory(null)}><Text style={styles.clearCategory}>Dejar pendiente de clasificación</Text></TouchableOpacity>}
      {movement && onDelete && <TouchableOpacity onPress={onDelete} style={styles.deleteButton}><Text style={styles.deleteButtonText}>Eliminar movimiento</Text></TouchableOpacity>}
    </ScrollView></SafeAreaView>
  </Modal>;
}

function CategoryEditor({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  useEffect(() => { if (visible) setName(""); }, [visible]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.dialogBackdrop}><View style={styles.dialog}><Text style={styles.dialogTitle}>Nueva categoría</Text><TextInput autoFocus value={name} onChangeText={setName} placeholder="Nombre de la categoría" style={styles.textInput} /><View style={styles.dialogActions}><TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Cancelar</Text></TouchableOpacity><TouchableOpacity onPress={() => name.trim() && onSave(name.trim())}><Text style={styles.modalSave}>Crear</Text></TouchableOpacity></View></View></View></Modal>;
}

function NavItem({ label, symbol, active, onPress }: { label: string; symbol: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity style={styles.navItem} onPress={onPress}><Text style={[styles.navSymbol, active && styles.navActive]}>{symbol}</Text><Text style={[styles.navLabel, active && styles.navActive]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F7FB" }, app: { flex: 1 }, content: { paddingHorizontal: 20, paddingTop: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }, eyebrow: { fontSize: 11, letterSpacing: 1.5, color: "#6D5EF7", fontWeight: "800" }, greeting: { fontSize: 28, color: "#17203A", fontWeight: "800", marginTop: 3 },
  avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#EAE7FF", alignItems: "center", justifyContent: "center" }, avatarText: { color: "#5949E8", fontWeight: "800" },
  periodRow: { flexDirection: "row", marginBottom: 14, gap: 8 }, periodPill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "#EAECF3" }, periodPillActive: { backgroundColor: "#17203A" }, periodText: { color: "#727A8E", fontWeight: "600", fontSize: 12 }, periodTextActive: { color: "white" },
  balanceCard: { backgroundColor: "#6D5EF7", borderRadius: 26, padding: 24, shadowColor: "#6D5EF7", shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 }, cardLabel: { color: "#DCD8FF", letterSpacing: 1.2, fontWeight: "700", fontSize: 11 }, balance: { color: "white", fontSize: 34, fontWeight: "800", marginTop: 8 }, balanceCaption: { color: "#DCD8FF", marginTop: 3 }, divider: { height: 1, backgroundColor: "rgba(255,255,255,0.18)", marginVertical: 20 }, totalsRow: { flexDirection: "row", justifyContent: "space-between" }, totalBlock: { flexDirection: "row", alignItems: "center", gap: 9, width: "48%" }, totalDotIncome: { backgroundColor: "#51D7AA", color: "#12493B", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 10, fontWeight: "900" }, totalDotExpense: { backgroundColor: "#FF9A9A", color: "#712A2A", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 10, fontWeight: "900" }, totalLabel: { color: "#DCD8FF", fontSize: 11 }, totalValue: { color: "white", fontWeight: "800", fontSize: 15, marginTop: 2 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 30, marginBottom: 12 }, sectionTitle: { fontSize: 18, fontWeight: "800", color: "#17203A" }, sectionHint: { fontSize: 12, color: "#8A91A3", marginTop: 3 }, filterButton: { paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "#EAECF3", borderRadius: 14 }, filterText: { color: "#596074", fontSize: 12, fontWeight: "700" }, link: { color: "#6D5EF7", fontWeight: "700", fontSize: 12 },
  categoryCard: { backgroundColor: "white", borderRadius: 20, padding: 18 }, barTrack: { height: 12, flexDirection: "row", marginBottom: 16 }, barPart: { height: 12 }, categoryRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 }, categoryDot: { width: 9, height: 9, borderRadius: 5, marginRight: 10 }, categoryName: { flex: 1, color: "#343B50", fontWeight: "600" }, categoryPercent: { width: 40, color: "#9AA0B0", fontSize: 12 }, categoryValue: { width: 78, textAlign: "right", color: "#17203A", fontWeight: "700" },
  movementCard: { backgroundColor: "white", borderRadius: 20, paddingHorizontal: 16 }, movementRow: { flexDirection: "row", alignItems: "center", paddingVertical: 16, gap: 12 }, movementBorder: { borderBottomWidth: 1, borderBottomColor: "#F0F1F5" }, dateBox: { width: 42, height: 48, borderRadius: 13, backgroundColor: "#F2F3F8", alignItems: "center", justifyContent: "center" }, dateDay: { fontSize: 16, fontWeight: "800", color: "#272E43" }, dateMonth: { fontSize: 8, letterSpacing: 0.8, color: "#9298A8", fontWeight: "700" }, movementTitle: { color: "#20273B", fontWeight: "700", fontSize: 14 }, movementDetail: { color: "#9298A8", fontSize: 10, marginTop: 2 }, tag: { alignSelf: "flex-start", marginTop: 6, backgroundColor: "#F0EDFF", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }, tagText: { color: "#6D5EF7", fontSize: 9, fontWeight: "700" }, tagPending: { backgroundColor: "#FFF2D7" }, tagPendingText: { color: "#9B6811" }, amount: { color: "#D94E5D", fontSize: 13, fontWeight: "800" }, income: { color: "#15936C" },
  pageTitle: { fontSize: 30, fontWeight: "800", color: "#17203A", marginTop: 8 }, pageSubtitle: { color: "#7E8598", lineHeight: 20, marginTop: 6, marginBottom: 22 }, pendingBanner: { flexDirection: "row", backgroundColor: "#FFF5DE", padding: 14, borderRadius: 17, alignItems: "center", gap: 12, marginBottom: 16 }, pendingIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#E8A838", color: "white", textAlign: "center", lineHeight: 28, fontWeight: "900" }, pendingTitle: { color: "#6A4A12", fontWeight: "800" }, pendingText: { color: "#957240", fontSize: 11, marginTop: 2 }, chips: { flexDirection: "row", gap: 8, marginBottom: 14 }, categoryFilters: { gap: 8, paddingBottom: 14 }, chip: { backgroundColor: "#EAECF3", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16 }, chipActive: { backgroundColor: "#17203A", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16 }, chipText: { color: "#6C7385", fontWeight: "700", fontSize: 12 }, chipActiveText: { color: "white", fontWeight: "700", fontSize: 12 }, emptyText: { textAlign: "center", color: "#8A91A3", paddingVertical: 18 },
  primaryButton: { backgroundColor: "#6D5EF7", paddingVertical: 14, borderRadius: 16, alignItems: "center", marginBottom: 16 }, primaryButtonText: { color: "white", fontWeight: "800" }, manageCategoryRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F2F6" }, categoryIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12 }, manageCategoryName: { flex: 1, fontWeight: "700", color: "#2D3448" }, chevron: { fontSize: 24, color: "#A3A8B5" },
  settingsCard: { backgroundColor: "white", borderRadius: 20, paddingHorizontal: 18 }, settingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: "#F0F1F5" }, statusDot: { width: 11, height: 11, borderRadius: 6 }, statusConnected: { backgroundColor: "#20A477" }, statusOffline: { backgroundColor: "#EF6A6A" }, statusPending: { backgroundColor: "#E8A838" }, settingTitle: { color: "#232A3E", fontWeight: "800" }, settingHint: { color: "#8A91A3", fontSize: 11, marginTop: 3 }, settingState: { color: "#6D5EF7", fontWeight: "700", fontSize: 11 },
  nav: { position: "absolute", bottom: 0, left: 0, right: 0, height: 84, backgroundColor: "white", borderTopWidth: 1, borderTopColor: "#ECEEF3", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingBottom: 8 }, navItem: { alignItems: "center", width: 66 }, navSymbol: { color: "#9AA0AF", fontSize: 21 }, navLabel: { color: "#9AA0AF", fontSize: 9, marginTop: 4, fontWeight: "600" }, navActive: { color: "#6D5EF7" }, addButton: { width: 50, height: 50, borderRadius: 17, backgroundColor: "#6D5EF7", alignItems: "center", justifyContent: "center", marginTop: -25, shadowColor: "#6D5EF7", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }, addButtonText: { color: "white", fontSize: 27, lineHeight: 29 },
  modalSafe: { flex: 1, backgroundColor: "#F6F7FB" }, modalContent: { padding: 20, paddingBottom: 50 }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }, modalTitle: { fontSize: 17, fontWeight: "800", color: "#17203A" }, modalCancel: { color: "#7C8497", fontWeight: "600" }, modalSave: { color: "#6D5EF7", fontWeight: "800" }, inputLabel: { color: "#777F92", fontSize: 10, letterSpacing: 1.1, fontWeight: "800", marginTop: 20, marginBottom: 8 }, kindRow: { flexDirection: "row", gap: 10 }, kindButton: { flex: 1, paddingVertical: 14, alignItems: "center", backgroundColor: "#E9EBF2", borderRadius: 14 }, kindButtonExpense: { backgroundColor: "#EF6A6A" }, kindButtonIncome: { backgroundColor: "#20A477" }, kindText: { color: "#697084", fontWeight: "800" }, kindTextActive: { color: "white" }, amountInput: { backgroundColor: "white", borderRadius: 18, padding: 18, fontSize: 30, fontWeight: "800", color: "#17203A" }, textInput: { backgroundColor: "white", borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, color: "#17203A", borderWidth: 1, borderColor: "#E7E9F0" }, categoryPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, pickerChip: { backgroundColor: "#E9EBF2", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14 }, pickerChipActive: { backgroundColor: "#6D5EF7", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14 }, pickerChipText: { color: "#626A7C", fontWeight: "700", fontSize: 12 }, pickerChipTextActive: { color: "white", fontWeight: "700", fontSize: 12 }, clearCategory: { color: "#D05A67", textAlign: "center", marginTop: 24, fontWeight: "700" }, deleteButton: { borderWidth: 1, borderColor: "#F1B7BD", borderRadius: 14, paddingVertical: 13, alignItems: "center", marginTop: 18 }, deleteButtonText: { color: "#C94C59", fontWeight: "800" },
  dialogBackdrop: { flex: 1, backgroundColor: "rgba(20,25,40,0.45)", justifyContent: "center", padding: 24 }, dialog: { backgroundColor: "#F8F9FC", borderRadius: 22, padding: 20 }, dialogTitle: { fontSize: 20, fontWeight: "800", color: "#17203A", marginBottom: 18 }, dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 24, marginTop: 20 }
});
