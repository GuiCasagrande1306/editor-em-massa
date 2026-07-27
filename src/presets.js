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
  },
  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    category: 'Cinema',
    description: 'Look cinematográfico: sombras esverdeadas e pele alaranjada',
    icon: 'Clapperboard',
    settings: {
      brightness: 102,
      contrast: 120,
      saturate: 132,
      sepia: 10,
      hueRotate: 8,
      blur: 0,
      grayscale: 0,
    }
  },
  {
    id: 'moody-dark',
    name: 'Moody Dark',
    category: 'Atmosférico',
    description: 'Sombrio e dramático, com sombras profundas e cores contidas',
    icon: 'CloudMoon',
    settings: {
      brightness: 86,
      contrast: 122,
      saturate: 82,
      sepia: 0,
      hueRotate: 0,
      blur: 0,
      grayscale: 12,
    }
  },
  {
    id: 'warm-portrait',
    name: 'Warm Portrait',
    category: 'Retrato',
    description: 'Retrato quente e suave, ideal para tons de pele',
    icon: 'Smile',
    settings: {
      brightness: 106,
      contrast: 98,
      saturate: 110,
      sepia: 16,
      hueRotate: 350,
      blur: 0.3,
      grayscale: 0,
    }
  },
  {
    id: 'desaturated-urban',
    name: 'Desaturated Urban',
    category: 'Urbano',
    description: 'Urbano frio e dessaturado, com um leve toque azulado',
    icon: 'Building2',
    settings: {
      brightness: 98,
      contrast: 114,
      saturate: 68,
      sepia: 0,
      hueRotate: 205,
      blur: 0,
      grayscale: 15,
    }
  },
  {
    id: 'vivid-landscape',
    name: 'Vivid Landscape',
    category: 'Paisagem',
    description: 'Paisagem vibrante: verdes e azuis intensos com bom contraste',
    icon: 'Mountain',
    settings: {
      brightness: 105,
      contrast: 116,
      saturate: 148,
      sepia: 0,
      hueRotate: 0,
      blur: 0,
      grayscale: 0,
    }
  },
  {
    id: 'bw-punch',
    name: 'B&W Punch',
    category: 'P&B',
    description: 'Preto e branco de alto impacto, contraste elevado',
    icon: 'Contrast',
    settings: {
      brightness: 100,
      contrast: 150,
      saturate: 0,
      sepia: 0,
      hueRotate: 0,
      blur: 0,
      grayscale: 100,
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
