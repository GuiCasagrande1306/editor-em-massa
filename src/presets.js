// src/presets.js

export const PRESETS = [
  {
    id: 'original',
    name: 'Original',
    category: 'Básico',
    description: 'Restaura a imagem às configurações originais',
    icon: 'RotateCcw',
    settings: {
      brightness: 100,
      contrast: 100,
      saturate: 100,
      sepia: 0,
      hueRotate: 0,
      blur: 0,
      grayscale: 0,
    }
  },
  {
    id: 'vivid-product',
    name: 'Produto & Clean',
    category: 'E-commerce',
    description: 'Iluminação limpa com cores vivas, ideal para e-commerce e fotos de catálogo',
    icon: 'ShoppingBag',
    settings: {
      brightness: 108,
      contrast: 112,
      saturate: 115,
      sepia: 0,
      hueRotate: 0,
      blur: 0,
      grayscale: 0,
    }
  },
  {
    id: 'classic-bw',
    name: 'P&B Dramático',
    category: 'Artístico',
    description: 'Preto e branco de alto contraste com tons escuros profundos',
    icon: 'Camera',
    settings: {
      brightness: 102,
      contrast: 135,
      saturate: 0,
      sepia: 0,
      hueRotate: 0,
      blur: 0,
      grayscale: 100,
    }
  },
  {
    id: 'vintage-sepia',
    name: 'Retro / Warm',
    category: 'Estilo',
    description: 'Tom retrô aquecido e nostálgico com contraste suave',
    icon: 'Sun',
    settings: {
      brightness: 104,
      contrast: 95,
      saturate: 90,
      sepia: 35,
      hueRotate: 345,
      blur: 0,
      grayscale: 0,
    }
  },
  {
    id: 'cyberpunk',
    name: 'Cyber Neon',
    category: 'Estilo',
    description: 'Cores neon chamativas com alteração da matriz de tom',
    icon: 'Zap',
    settings: {
      brightness: 110,
      contrast: 125,
      saturate: 160,
      sepia: 0,
      hueRotate: 180,
      blur: 0,
      grayscale: 0,
    }
  },
  {
    id: 'soft-portrait',
    name: 'Retrato Suave',
    category: 'Retrato',
    description: 'Suaviza detalhes e ilumina tons de pele',
    icon: 'Smile',
    settings: {
      brightness: 105,
      contrast: 98,
      saturate: 105,
      sepia: 5,
      hueRotate: 0,
      blur: 0.5,
      grayscale: 0,
    }
  },
  {
    id: 'cold-cinematic',
    name: 'Cinema Frio',
    category: 'Estilo',
    description: 'Tom azulado dramático inspirado no cinema de suspense',
    icon: 'Film',
    settings: {
      brightness: 95,
      contrast: 118,
      saturate: 85,
      sepia: 0,
      hueRotate: 190,
      blur: 0,
      grayscale: 0,
    }
  }
];

// Função utilitária para converter os valores do preset na string de ctx.filter
export function getCanvasFilterString(settings) {
  const {
    brightness = 100,
    contrast = 100,
    saturate = 100,
    sepia = 0,
    hueRotate = 0,
    blur = 0,
    grayscale = 0
  } = settings;

  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) sepia(${sepia}%) hue-rotate(${hueRotate}deg) blur(${blur}px) grayscale(${grayscale}%)`;
}
