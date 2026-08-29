<script setup lang="ts">
defineProps<{ paused?: boolean }>()
</script>

<!-- Step back and drop the trailing knee; front shin stays vertical.
     Convention is documented in goblet-squat.vue: 200x200 viewBox, ground at
     y=185, side profile unless noted, CSS keyframes on grouped <g> elements,
     3.5s loop (0.25s hold, 2s eccentric, 0.25s hold, 1s concentric). -->

<template>
  <svg viewBox="0 0 200 200" role="img" class="fig" :class="{ 'is-paused': paused }">
    <title>Dumbbell reverse lunge</title>
    <line class="ground" x1="20" y1="185" x2="180" y2="185" />

    <g class="ghost" aria-hidden="true">
      <circle cx="100" cy="58" r="12" />
      <line x1="100" y1="70" x2="100" y2="112" />
      <line x1="100" y1="112" x2="100" y2="150" />
      <line x1="100" y1="150" x2="100" y2="183" />
      <line x1="94" y1="183" x2="114" y2="184" />
    </g>
    <path class="arrow" d="M126 118 L126 146 M121 140 L126 147 L131 140" aria-hidden="true" />
    <g class="shin">
      <line x1="100" y1="183" x2="100" y2="150" />
      <line x1="94" y1="183" x2="115" y2="184" />
      <circle class="joint" cx="100" cy="150" r="4" />

      <g class="thigh">
        <line x1="100" y1="150" x2="100" y2="112" />
        <circle class="joint" cx="100" cy="112" r="4" />

        <g class="torso">
          <line x1="100" y1="112" x2="100" y2="71" />
          <circle class="head" cx="100" cy="58" r="12" />
          <g class="arm">
            <line x1="100" y1="80" x2="100" y2="112" />
            <rect class="load" x="92" y="110" width="16" height="10" rx="5" />
          </g>
          <g class="backleg">
            <line x1="100" y1="112" x2="100" y2="150" />
            <line class="backshin" x1="100" y1="150" x2="100" y2="183" />
          </g>
        </g>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.fig {
  width: 100%;
  height: 100%;
  color: inherit;
  --accent: var(--color-work);
}

.fig :is(line, circle, path, polyline) {
  fill: none;
  stroke: currentColor;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ground {
  stroke-width: 2;
  opacity: 0.3;
}

.head {
  stroke-width: 3.5;
}

.joint {
  r: 4;
  stroke-width: 2;
  opacity: 0.45;
}

.prop {
  stroke-width: 3;
  opacity: 0.4;
}

.load {
  fill: var(--accent);
  stroke: none;
}

.shin {
  transform-box: view-box;
  transform-origin: 100px 183px;
  animation: shin 3.5s ease-in-out infinite;
}

@keyframes shin {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(12deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.thigh {
  transform-box: view-box;
  transform-origin: 100px 150px;
  animation: thigh 3.5s ease-in-out infinite;
}

@keyframes thigh {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(-52deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.torso {
  transform-box: view-box;
  transform-origin: 100px 112px;
  animation: torso 3.5s ease-in-out infinite;
}

@keyframes torso {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(42deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.arm {
  transform-box: view-box;
  transform-origin: 100px 80px;
  animation: arm 3.5s ease-in-out infinite;
}

@keyframes arm {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(-42deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.backleg {
  transform-box: view-box;
  transform-origin: 100px 112px;
  animation: backleg 3.5s ease-in-out infinite;
}

@keyframes backleg {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(38deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.is-paused :is(.shin, .thigh, .torso, .arm, .backleg) {
  animation-play-state: paused;
}

.ghost,
.arrow {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .shin, .thigh, .torso, .arm, .backleg {
    animation: none;
  }
  .shin {
    transform: rotate(12deg);
  }
  .thigh {
    transform: rotate(-52deg);
  }
  .torso {
    transform: rotate(42deg);
  }
  .arm {
    transform: rotate(-42deg);
  }
  .backleg {
    transform: rotate(38deg);
  }
  .ghost,
  .arrow {
    display: block;
    opacity: 0.32;
  }
  .ghost {
    transform: translateX(-46px);
    transform-box: view-box;
  }
}
</style>
