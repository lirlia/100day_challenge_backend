"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  PerspectiveCamera,
  Stars,
} from "@react-three/drei";
import * as THREE from "three";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { create } from "zustand";

// Game state types
type GameState = "menu" | "playing" | "paused" | "gameOver";

interface Player {
  position: [number, number, number];
  health: number;
  maxHealth: number;
}

interface Bullet {
  id: string;
  position: [number, number, number];
  velocity: [number, number, number];
}

interface Enemy {
  id: string;
  position: [number, number, number];
  velocity: [number, number, number];
  health: number;
}

interface GameStore {
  // Game state
  gameState: GameState;
  score: number;
  wave: number;

  // Game objects
  player: Player;
  bullets: Record<string, Bullet>;
  enemies: Record<string, Enemy>;

  // Actions
  setGameState: (state: GameState) => void;
  addScore: (points: number) => void;
  updatePlayerPosition: (position: [number, number, number]) => void;
  addBullet: (bullet: Bullet) => void;
  removeBullet: (id: string) => void;
  addEnemy: (enemy: Enemy) => void;
  removeEnemy: (id: string) => void;
  damagePlayer: (damage: number) => void;
  resetGame: () => void;
}

const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  gameState: "menu",
  score: 0,
  wave: 1,

  player: {
    position: [0, -2, 0],
    health: 100,
    maxHealth: 100,
  },
  bullets: {},
  enemies: {},

  // Actions
  setGameState: (state) => set({ gameState: state }),
  addScore: (points) => set((state) => ({ score: state.score + points })),
  updatePlayerPosition: (position) => set((state) => ({
    player: { ...state.player, position }
  })),
  addBullet: (bullet) => set((state) => ({
    bullets: { ...state.bullets, [bullet.id]: bullet }
  })),
  removeBullet: (id) => set((state) => {
    const newBullets = { ...state.bullets };
    delete newBullets[id];
    return { bullets: newBullets };
  }),
  addEnemy: (enemy) => set((state) => ({
    enemies: { ...state.enemies, [enemy.id]: enemy }
  })),
  removeEnemy: (id) => set((state) => {
    const newEnemies = { ...state.enemies };
    delete newEnemies[id];
    return { enemies: newEnemies };
  }),
  damagePlayer: (damage) => set((state) => ({
    player: {
      ...state.player,
      health: Math.max(0, state.player.health - damage)
    }
  })),
  resetGame: () => set({
    gameState: "menu",
    score: 0,
    wave: 1,
    player: {
      position: [0, -2, 0],
      health: 100,
      maxHealth: 100,
    },
    bullets: {},
    enemies: {},
  }),
}));

// Player component
function Player() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { viewport } = useThree();
  const { player, updatePlayerPosition } = useGameStore();
  const [targetX, setTargetX] = useState(0);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const canvas = event.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const maxMove = viewport.width / 2 * 0.8;
      const newTargetX = mouseX * maxMove;
      setTargetX(newTargetX);
    },
    [viewport.width]
  );

  useEffect(() => {
    const canvasElement = document.querySelector("canvas");
    if (canvasElement) {
      canvasElement.addEventListener("mousemove", handleMouseMove as EventListener);
      return () =>
        canvasElement.removeEventListener("mousemove", handleMouseMove as EventListener);
    }
  }, [handleMouseMove]);

  useFrame(() => {
    if (meshRef.current) {
      // Smooth movement
      const currentX = meshRef.current.position.x;
      const newX = THREE.MathUtils.lerp(currentX, targetX, 0.1);
      meshRef.current.position.x = newX;

      const newPosition: [number, number, number] = [newX, player.position[1], player.position[2]];
      updatePlayerPosition(newPosition);
    }
  });

  return (
    <mesh ref={meshRef} position={player.position}>
      <coneGeometry args={[0.3, 1, 8]} />
      <meshStandardMaterial
        color="#00ffff"
        emissive="#00aaff"
        emissiveIntensity={0.7}
        flatShading
      />
    </mesh>
  );
}

// Bullet component
function BulletMesh({ bullet }: { bullet: Bullet }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { removeBullet } = useGameStore();

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.position.z += bullet.velocity[2] * delta;

      // Remove bullet if it goes off screen
      if (meshRef.current.position.z < -50) {
        removeBullet(bullet.id);
      }
    }
  });

  return (
    <mesh ref={meshRef} position={bullet.position}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={1.5} />
    </mesh>
  );
}

// Enemy component
function EnemyMesh({ enemy }: { enemy: Enemy }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { removeEnemy, damagePlayer, addScore } = useGameStore();
  const randomColor = useRef(new THREE.Color().setHSL(Math.random(), 0.8, 0.6)).current;

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.position.z += enemy.velocity[2] * delta;
      meshRef.current.position.x += enemy.velocity[0] * delta;

      // Rotate for visual effect
      meshRef.current.rotation.x += delta * 2;
      meshRef.current.rotation.y += delta * 1.5;

      // Remove enemy if it goes off screen
      if (meshRef.current.position.z > 10) {
        removeEnemy(enemy.id);
        damagePlayer(10); // Player takes damage if enemy escapes
      }
    }
  });

  return (
    <mesh ref={meshRef} position={enemy.position}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial
        color={randomColor}
        emissive={randomColor}
        emissiveIntensity={0.4}
        flatShading
      />
    </mesh>
  );
}

// Game logic component
function GameLogic() {
  const {
    gameState,
    player,
    addBullet,
    addEnemy,
    bullets,
    enemies,
    removeBullet,
    removeEnemy,
    addScore,
    setGameState
  } = useGameStore();

  // Shooting
  const shoot = useCallback(() => {
    if (gameState !== "playing") return;

    const bulletId = nanoid();
    const bullet: Bullet = {
      id: bulletId,
      position: [player.position[0], player.position[1] + 0.5, player.position[2]],
      velocity: [0, 0, -25]
    };
    addBullet(bullet);
  }, [gameState, player.position, addBullet]);

  useEffect(() => {
    const handleClick = () => shoot();
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        shoot();
      }
    };

    const canvasElement = document.querySelector("canvas");
    if (canvasElement) {
      canvasElement.addEventListener("click", handleClick);
      document.addEventListener("keydown", handleKeyPress);
      return () => {
        canvasElement.removeEventListener("click", handleClick);
        document.removeEventListener("keydown", handleKeyPress);
      };
    }
  }, [shoot]);

  // Enemy spawning
  useEffect(() => {
    if (gameState !== "playing") return;

    const spawnInterval = setInterval(() => {
      const enemyId = nanoid();
      const x = (Math.random() - 0.5) * 8;
      const enemy: Enemy = {
        id: enemyId,
        position: [x, 0, -30],
        velocity: [(Math.random() - 0.5) * 2, 0, Math.random() * 3 + 4],
        health: 1
      };
      addEnemy(enemy);
    }, 1500);

    return () => clearInterval(spawnInterval);
  }, [gameState, addEnemy]);

  // Collision detection
  useFrame(() => {
    if (gameState !== "playing") return;

    // Check bullet-enemy collisions
    Object.values(bullets).forEach(bullet => {
      Object.values(enemies).forEach(enemy => {
        const bulletPos = new THREE.Vector3(...bullet.position);
        const enemyPos = new THREE.Vector3(...enemy.position);

        if (bulletPos.distanceTo(enemyPos) < 0.6) {
          removeBullet(bullet.id);
          removeEnemy(enemy.id);
          addScore(10);
        }
      });
    });

    // Check player-enemy collisions
    const playerPos = new THREE.Vector3(...player.position);
    Object.values(enemies).forEach(enemy => {
      const enemyPos = new THREE.Vector3(...enemy.position);

      if (playerPos.distanceTo(enemyPos) < 0.8) {
        removeEnemy(enemy.id);
        // Player takes damage - handled in enemy component
      }
    });

    // Check game over condition
    if (player.health <= 0) {
      setGameState("gameOver");
    }
  });

  return null;
}

// Main game scene
function GameScene3D() {
  const { bullets, enemies } = useGameStore();

  return (
    <>
      <PerspectiveCamera makeDefault fov={75} position={[0, 0, 8]} near={0.1} far={1000} />
      <ambientLight intensity={0.4} color="#66bbff" />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1.5}
        color="#77ccff"
      />
      <pointLight position={[-10, -5, -10]} color="#ff00cc" intensity={1} distance={30} />
      <pointLight position={[10, 5, -10]} color="#00ffff" intensity={1} distance={30} />

      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      <Player />

      {Object.values(bullets).map(bullet => (
        <BulletMesh key={bullet.id} bullet={bullet} />
      ))}

      {Object.values(enemies).map(enemy => (
        <EnemyMesh key={enemy.id} enemy={enemy} />
      ))}

      <GameLogic />
    </>
  );
}

// UI Components
function GameUI() {
  const { gameState, score, player, setGameState, resetGame } = useGameStore();

  const startGame = () => {
    resetGame();
    setGameState("playing");
  };

  if (gameState === "menu") {
    return (
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        color: '#00ddff',
        fontFamily: '"Orbitron", sans-serif',
      }}>
        <h1 style={{
          fontSize: '48px',
          marginBottom: '20px',
          textShadow: '0 0 20px #00ffff'
        }}>
          CYBERPUNK SHOOTER
        </h1>
        <button
          onClick={startGame}
          style={{
            padding: '15px 30px',
            fontSize: '24px',
            background: 'linear-gradient(45deg, #ff00ff, #00ffff)',
            border: 'none',
            borderRadius: '10px',
            color: 'white',
            cursor: 'pointer',
            fontFamily: '"Orbitron", sans-serif',
            textShadow: '0 0 10px rgba(255,255,255,0.8)'
          }}
        >
          START GAME
        </button>
      </div>
    );
  }

  if (gameState === "gameOver") {
    return (
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        color: '#ff0066',
        fontFamily: '"Orbitron", sans-serif',
      }}>
        <h1 style={{
          fontSize: '48px',
          marginBottom: '20px',
          textShadow: '0 0 20px #ff0066'
        }}>
          GAME OVER
        </h1>
        <p style={{ fontSize: '24px', marginBottom: '20px' }}>
          Final Score: {score}
        </p>
        <button
          onClick={startGame}
          style={{
            padding: '15px 30px',
            fontSize: '20px',
            background: 'linear-gradient(45deg, #ff00ff, #00ffff)',
            border: 'none',
            borderRadius: '10px',
            color: 'white',
            cursor: 'pointer',
            fontFamily: '"Orbitron", sans-serif',
          }}
        >
          PLAY AGAIN
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        color: '#00ddff',
        fontSize: '24px',
        fontFamily: '"Orbitron", sans-serif',
        textShadow: '0 0 10px #00ffff'
      }}>
        SCORE: {score}
      </div>
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        color: '#00ff88',
        fontSize: '18px',
        fontFamily: '"Orbitron", sans-serif',
      }}>
        HEALTH: {player.health}/{player.maxHealth}
      </div>
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#00ffaa',
        fontSize: '14px',
        fontFamily: 'monospace',
        textAlign: 'center'
      }}>
        マウスで移動 | クリック/スペースで射撃
      </div>
    </>
  );
}

export default function GameScene() {
  return (
    <>
      <Canvas shadows style={{ background: "#020208" }} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <GameScene3D />
        </Suspense>
      </Canvas>
      <GameUI />
    </>
  );
}
