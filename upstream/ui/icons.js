import {
  createElement, Power, Sun, Sofa, Film, Moon, DoorOpen, LampCeiling, LampFloor, LampDesk, Lightbulb,
  Snowflake, Flame, Droplets, Fan, Wind, Leaf, ChevronDown, ChevronLeft, Plus, Minus, Thermometer,
  SlidersHorizontal, Check, House, Settings2, AirVent, Sparkles, FolderOpen, Plug, Lamp, SunDim, SunMedium,
  Tv, BedDouble, Palette, RefreshCw, X, LampWallUp,
  ShieldCheck, Link2, Copy, MessageSquareText, BookOpen, Terminal, RotateCcw, Globe, Laptop, Clock, Box, Download,
  Undo2, Activity, KeyRound, ArrowUpRight, Camera, Square,
  HouseWifi, Smartphone, Radar, CircleCheck, CircleAlert, ChevronRight, Unlink, LoaderCircle, Router,
  List, Trash2, Scan, Redo2, Map as MapIcon, DoorClosed, Armchair,
  // ha3d: devices from Home Assistant
  Lock, LockOpen, Warehouse, Speaker, Blinds, Gauge, Siren, Bell, Music, WashingMachine, Car, Coffee, Droplet,
  Gamepad2, Monitor, Heater, Shield, Upload, Play, Bot, Waves, ToggleRight,
} from 'lucide';

const ICONS = {
  power: Power, sun: Sun, sofa: Sofa, film: Film, moon: Moon, door: DoorOpen,
  ceiling: LampCeiling, pendant: Lamp, spots: Lightbulb, floor: LampFloor, table: LampDesk, strip: Sparkles,
  pendantBar: Lamp, sconce: LampWallUp, cans: Lightbulb, dome: LampCeiling, // ha3d: extra light types
  cool: Snowflake, heat: Flame, dry: Droplets, fan: Fan, auto: RefreshCw, wind: Wind, leaf: Leaf,
  down: ChevronDown, back: ChevronLeft, plus: Plus, minus: Minus, thermo: Thermometer,
  sliders: SlidersHorizontal, check: Check, home: House, settings: Settings2, ac: AirVent,
  folder: FolderOpen, plug: Plug, dim: SunDim, bright: SunMedium, tv: Tv, bed: BedDouble,
  palette: Palette, sparkles: Sparkles, close: X,
  shield: ShieldCheck, link: Link2, copy: Copy, chat: MessageSquareText, book: BookOpen, terminal: Terminal,
  rotate: RotateCcw, globe: Globe, laptop: Laptop, clock: Clock, box: Box, download: Download, undo: Undo2,
  activity: Activity, key: KeyRound, external: ArrowUpRight, camera: Camera, stop: Square,
  homeassistant: HouseWifi, phone: Smartphone, radar: Radar, ok: CircleCheck, alert: CircleAlert,
  next: ChevronRight, unlink: Unlink, spinner: LoaderCircle, bridge: Router, bulb: Lightbulb,
  list: List, trash: Trash2, fit: Scan, redo: Redo2, map: MapIcon, opening: DoorClosed, furniture: Armchair,
  // ha3d
  lock: Lock, unlock: LockOpen, garage: Warehouse, speaker: Speaker, blinds: Blinds, sensor: Gauge, siren: Siren,
  bell: Bell, music: Music, washer: WashingMachine, car: Car, coffee: Coffee, water: Droplet, gamepad: Gamepad2,
  monitor: Monitor, heater: Heater, alarm: Shield, upload: Upload, play: Play, robot: Bot, pool: Waves,
  switch: ToggleRight, thermometer: Thermometer, lightbulb: Lightbulb, 'ceiling-fan': Fan,
};

// ha3d: the raw lucide drawing ([tag, attributes] pairs), for icons painted on a canvas in the 3D view.
export const iconNode = (name) => ICONS[name] || ICONS.sparkles;
export const hasIcon = (name) => name in ICONS;

export function icon(name, size = 18, stroke = 1.8) {
  const el = createElement(ICONS[name] || ICONS.sparkles);
  el.setAttribute('width', size);
  el.setAttribute('height', size);
  el.setAttribute('stroke-width', stroke);
  el.classList.add('icon');
  return el;
}
