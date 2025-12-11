<template>
  <div class="p-4 bg-emerald-900/30 border border-emerald-500/30 rounded-xl">
    <h3 class="text-xl font-bold text-emerald-400 mb-2">Vue Component</h3>
    <p class="text-slate-300 mb-4">This is a Vue 3 component running inside React!</p>
    <div class="flex items-center gap-4">
      <button 
        @click="count--"
        class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded transition-colors"
      >
        -
      </button>
      <span class="text-2xl font-mono text-white">{{ count }}</span>
      <button 
        @click="count++"
        class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded transition-colors"
      >
        +
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>
