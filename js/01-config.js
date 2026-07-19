// ==================== 01-config.js ====================
// Constants, State, DOM Elements

const PERSONAL_STORAGE_KEY = "accounts-personal-v1";
const WORK_STORAGE_KEY = "accounts-work-v1";
const MODE_STORAGE_KEY = "accounts-mode-v1";
const THEME_KEY = "accounts-theme";
const DEBUG_KEY = "acc_debug";

// Global state
const state = {
  mode: "personal",
  people: [],
  search: "",
  confirmAction: null,
  reopenEditAfterConfirm: false,
  personFilter: "active",
  personBalancePrev: {},
  totalBalancePrev: 0,
  longPressTimer: null,
  longPressTriggered: false
};

// DOM elements
const peopleListEl = document.getElementById("peopleList");
const emptyStateEl = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");

const fab = document.getElementById("fab");
const menuBtn = document.getElementById("menuBtn");
const themeToggleBtn = document.getElementById("themeToggleBtn");

const menuOverlay = document.getElementById("menuOverlay");
const menuEditStages = document.getElementById("menuEditStages");
const menuTransfer = document.getElementById("menuTransfer");
const menuDelete = document.getElementById("menuDelete");
const importFile = document.getElementById("importFile");

const modalOverlay = document.getElementById("modalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalContent = document.getElementById("modalContent");

const confirmOverlay = document.getElementById("confirmOverlay");
const confirmText = document.getElementById("confirmText");
const confirmCancel = document.getElementById("confirmCancel");
const confirmOk = document.getElementById("confirmOk");

const btnPersonal = document.getElementById("modePersonal");
const btnWork = document.getElementById("modeWork");

const installPromptOverlay = document.getElementById("installPromptOverlay");
const installPromptLaterBtn = document.getElementById("installPromptLaterBtn");
const installPromptInstallBtn = document.getElementById("installPromptInstallBtn");
const iosInstallPromptOverlay = document.getElementById("iosInstallPromptOverlay");
const iosInstallPromptCloseBtn = document.getElementById("iosInstallPromptCloseBtn");
const updatePromptOverlay = document.getElementById("updatePromptOverlay");
const updateCancelBtn = document.getElementById("updateCancelBtn");
const updateApplyBtn = document.getElementById("updateApplyBtn");
const updateExportBtn = document.getElementById("updateExportBtn");