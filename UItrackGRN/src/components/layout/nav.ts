import {
  Boxes,
  Building2,
  Cog,
  FileSpreadsheet,
  FileStack,
  Gauge,
  History,
  Forklift,
  MonitorSmartphone,
  QrCode,
  Route as RouteIcon,
  ScrollText,
  Upload,
  Users,
  Warehouse,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: typeof Gauge;
  group: string;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", to: "/", icon: Gauge, group: "Overview" },
  { label: "Materials", to: "/materials", icon: Boxes, group: "Master Data" },
  { label: "Vendors", to: "/vendors", icon: Building2, group: "Master Data" },
  { label: "SAP GRN Import", to: "/import", icon: Upload, group: "Operations" },
  { label: "Label Material Inward", to: "/labels", icon: QrCode, group: "Operations" },
  { label: "Material Issue", to: "/issue", icon: Forklift, group: "Shop Floor" },
  { label: "Inventory", to: "/inventory", icon: Warehouse, group: "Shop Floor" },
  { label: "Traceability", to: "/traceability", icon: RouteIcon, group: "Shop Floor" },
  { label: "Reports", to: "/reports", icon: FileStack, group: "Insights" },
  { label: "Import History", to: "/import-history", icon: FileSpreadsheet, group: "Insights" },
  { label: "Revision History", to: "/revisions", icon: History, group: "Insights" },
  { label: "Users", to: "/users", icon: Users, group: "Administration" },
  { label: "Stations", to: "/stations", icon: MonitorSmartphone, group: "Administration" },
  { label: "Configuration", to: "/configuration", icon: Cog, group: "Administration" },
  { label: "Audit Log", to: "/audit", icon: ScrollText, group: "Administration" },
];

export const navGroups = [
  "Overview",
  "Master Data",
  "Operations",
  "Shop Floor",
  "Insights",
  "Administration",
] as const;
