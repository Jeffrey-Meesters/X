<script setup lang="ts">
defineProps<{ paused?: boolean }>()
</script>

<!--
  AUTHORING CONVENTION (spec section 4). Every animation in this folder follows
  it, so fifteen drawings read as one set.

  Canvas   200x200 viewBox, ground line fixed at y=185 in every file so the
           figure never jumps between exercises.
  View     Side profile, facing right. Front view only for the dead bug and
           the side plank, where depth is what the movement is about.
  Style    Stick figure, joint circles, dumbbells as rounded rects. Body uses
           currentColor; the load uses --accent so theming touches one value.
  Rig      Forward kinematics from a planted foot: the shin rotates about the
           ankle, the thigh about the knee inside it, the torso about the hip
           inside that. Nesting means the joints stay connected for free, and
           the foot never slides off the floor - which is exactly what goes
           wrong if each limb is animated independently.
  Motion   CSS @keyframes on grouped <g> elements. Not SMIL: weaker tooling and
           browser support, and it cannot be driven by the `paused` prop.
  Tempo    One loop is 3.5s - 0.25s hold, 2s eccentric, 0.25s hold at the
           stretch, 1s concentric. That mirrors the prescribed 2-1 tempo, so
           the animation doubles as a pacing guide.
           Keyframe stops: 0% / 7% / 64% / 71% / 100%.
  Reduced  Freeze at the stretched pose and draw the start pose beside it with
  motion   a motion arrow, rather than simply stopping.
  A11y     role="img" plus a <title> matching the exercise name. No text inside
           the SVG - it would need translating.
-->

<template>
  <svg
    viewBox="0 0 200 200"
    role="img"
    class="fig"
    :class="{ 'is-paused': paused }"
  >
    <title>Goblet squat</title>

    <line class="ground" x1="20" y1="185" x2="180" y2="185" />

    <!-- Start pose, shown only under prefers-reduced-motion. -->
    <g class="ghost" aria-hidden="true">
      <circle cx="100" cy="58" r="12" />
      <line x1="100" y1="70" x2="100" y2="112" />
      <line x1="100" y1="112" x2="100" y2="150" />
      <line x1="100" y1="150" x2="100" y2="183" />
      <line x1="94" y1="183" x2="114" y2="184" />
    </g>
    <path class="arrow" d="M126 120 L126 148 M121 142 L126 149 L131 142" aria-hidden="true" />

    <g class="shin">
      <line x1="100" y1="183" x2="100" y2="150" />
      <line class="foot" x1="94" y1="183" x2="115" y2="184" />
      <circle class="joint" cx="100" cy="150" r="3.5" />

      <g class="thigh">
        <line x1="100" y1="150" x2="100" y2="112" />
        <circle class="joint" cx="100" cy="112" r="3.5" />

        <g class="torso">
          <line x1="100" y1="112" x2="100" y2="71" />
          <circle class="head" cx="100" cy="58" r="12" />
          <!-- One arm in side profile: elbow tucked down, hand up under the
               bell. The load sits in front of the chest so it never covers
               the spine. -->
          <line x1="100" y1="80" x2="105" y2="103" />
          <line x1="105" y1="103" x2="112" y2="92" />
          <rect class="load" x="110" y="74" width="13" height="23" rx="6" />
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

.fig :is(line, circle, path) {
  fill: none;
  stroke: currentColor;
  stroke-width: 4;
  stroke-linecap: round;
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

.load {
  fill: var(--accent);
  stroke: none;
}

/* transform-box keeps transform-origin in viewBox units across browsers. */
.shin,
.thigh,
.torso {
  transform-box: view-box;
  animation-duration: 3.5s;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

.shin {
  transform-origin: 100px 183px;
  animation-name: shin;
}

.thigh {
  transform-origin: 100px 150px;
  animation-name: thigh;
}

.torso {
  transform-origin: 100px 112px;
  animation-name: torso;
}

/*
  Rotations compound down the chain, so each value is relative to its parent.
  The torso number looks large because it has to undo the thigh's rotation
  before adding its own forward lean.
*/
@keyframes shin {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(26deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

@keyframes thigh {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(-78deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

@keyframes torso {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(72deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.is-paused :is(.shin, .thigh, .torso) {
  animation-play-state: paused;
}

.ghost,
.arrow {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  /* Hold the stretched pose and show where the movement started, rather than
     freezing on an arbitrary frame. */
  .shin,
  .thigh,
  .torso {
    animation: none;
  }
  .shin {
    transform: rotate(24deg);
  }
  .thigh {
    transform: rotate(-78deg);
  }
  .torso {
    transform: rotate(72deg);
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
