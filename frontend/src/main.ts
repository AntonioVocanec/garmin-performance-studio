import { mount } from "svelte";
import App from "./App.svelte";
import NutritionShell from "./nutrition/NutritionShell.svelte";
import { initializeDashboardViews } from "./lib/dashboardViews";
import { startLegacyDashboard } from "./legacy/dashboard";
import "./styles.css";
import "./nutrition/nutrition.css";

const connectivityRoot = document.getElementById("connectivity-root");
if (!connectivityRoot) throw new Error("Svelte dashboard root is missing.");

mount(App, { target: connectivityRoot });
initializeDashboardViews();
startLegacyDashboard();
const nutritionRoot = document.getElementById("nutrition-root");
if (nutritionRoot) mount(NutritionShell, { target: nutritionRoot });
