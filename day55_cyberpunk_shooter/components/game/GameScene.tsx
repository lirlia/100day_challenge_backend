"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  PerspectiveCamera,
  Stars,
} from "@react-three/drei";
import * as THREE from "three";
import { Suspense, useCallback, useEffect, useRef, useState, useMemo, memo } from "react";
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
  targetEnemyId?: string;
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
  updateBulletPosition: (id: string, position: [number, number, number]) => void;
  updateBulletVelocity: (id: string, velocity: [number, number, number]) => void;
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
    health: 200,
    maxHealth: 200,
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
  updateBulletPosition: (id, position) => set((state) => ({
    bullets: { ...state.bullets, [id]: { ...state.bullets[id], position } }
  })),
  updateBulletVelocity: (id, velocity) => set((state) => ({
    bullets: { ...state.bullets, [id]: { ...state.bullets[id], velocity } }
  })),
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
      health: 200,
      maxHealth: 200,
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
  const [targetY, setTargetY] = useState(-2);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const canvas = event.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -(((event.clientY - rect.top) / rect.height) * 2 - 1); // Invert Y for correct direction

      const maxMoveX = viewport.width / 2 * 0.8;
      const maxMoveY = viewport.height / 2 * 0.7; // Y軸は少し制限を厳しく

      const newTargetX = Math.max(-maxMoveX, Math.min(maxMoveX, mouseX * maxMoveX));
      const newTargetY = Math.max(-maxMoveY, Math.min(maxMoveY, mouseY * maxMoveY));

      setTargetX(newTargetX);
      setTargetY(newTargetY);
    },
    [viewport.width, viewport.height]
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
      // Smooth movement for both X and Y
      const currentX = meshRef.current.position.x;
      const currentY = meshRef.current.position.y;
      const newX = THREE.MathUtils.lerp(currentX, targetX, 0.1);
      const newY = THREE.MathUtils.lerp(currentY, targetY, 0.1);

      meshRef.current.position.x = newX;
      meshRef.current.position.y = newY;

      const newPosition: [number, number, number] = [newX, newY, player.position[2]];
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
const BulletMesh = memo(function BulletMesh({ bullet }: { bullet: Bullet }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { removeBullet, enemies, updateBulletPosition, updateBulletVelocity } = useGameStore();

  // IDが無効な場合は早期リターン
  if (!bullet.id || bullet.id === 'undefined') {
    console.error('Invalid bullet ID:', bullet.id);
    return null;
  }

  useFrame((state, delta) => {
    if (meshRef.current) {
      // ホーミング機能：ターゲットが存在する場合は誘導
      if (bullet.targetEnemyId && enemies[bullet.targetEnemyId]) {
        const targetEnemy = enemies[bullet.targetEnemyId];
        const bulletPos = new THREE.Vector3(
          meshRef.current.position.x,
          meshRef.current.position.y,
          meshRef.current.position.z
        );
        const targetPos = new THREE.Vector3(...targetEnemy.position);

        // ターゲットへの方向ベクトルを計算
        const direction = targetPos.sub(bulletPos).normalize();

        // ホーミング強度（1.0 = 完全にターゲットに向かう）
        const homingStrength = 0.8; // 強力なホーミング

        // 現在の速度ベクトル
        const currentVelocity = new THREE.Vector3(...bullet.velocity);

        // ホーミング方向と現在の速度を混合
        const newVelocity = currentVelocity.lerp(
          direction.multiplyScalar(currentVelocity.length()),
          homingStrength
        );

        // 速度をZustandストア経由で更新
        const newVelocityArray: [number, number, number] = [newVelocity.x, newVelocity.y, newVelocity.z];
        updateBulletVelocity(bullet.id, newVelocityArray);
      }
      // ターゲットが存在しない場合は、もうホーミングしない（直進する）

      // 弾を移動
      meshRef.current.position.x += bullet.velocity[0] * delta;
      meshRef.current.position.y += bullet.velocity[1] * delta;
      meshRef.current.position.z += bullet.velocity[2] * delta;

      // Zustandストアの位置も更新
      const newPosition: [number, number, number] = [
        meshRef.current.position.x,
        meshRef.current.position.y,
        meshRef.current.position.z
      ];
      updateBulletPosition(bullet.id, newPosition);

      // Remove bullet if it goes off screen (範囲を拡大)
      if (meshRef.current.position.z < -100 || meshRef.current.position.z > 50 ||
        Math.abs(meshRef.current.position.x) > 50 || Math.abs(meshRef.current.position.y) > 50) {
        removeBullet(bullet.id);
      }
    }
  });

  return (
    <mesh ref={meshRef} position={bullet.position}>
      <sphereGeometry args={[0.15, 8, 8]} />
      <meshStandardMaterial
        color="#ff00ff"
        emissive="#ff00ff"
        emissiveIntensity={2.0}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
});

// Enemy component
const EnemyMesh = memo(function EnemyMesh({ enemy }: { enemy: Enemy }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { removeEnemy, damagePlayer, addScore } = useGameStore();
  const randomColor = useRef(new THREE.Color().setHSL(Math.random(), 0.8, 0.6)).current;

  // 各敵にランダムな回転速度を設定
  const rotationSpeed = useRef({
    x: (Math.random() - 0.5) * 6 + (Math.random() > 0.5 ? 2 : -2), // -4 から 4 の範囲、方向もランダム
    y: (Math.random() - 0.5) * 5 + (Math.random() > 0.5 ? 1.5 : -1.5), // -4 から 4 の範囲、方向もランダム
    z: (Math.random() - 0.5) * 4 + (Math.random() > 0.5 ? 1 : -1), // -3 から 3 の範囲、方向もランダム
  }).current;

  // 各敵のサイズもランダムに
  const randomSize = useRef(0.6 + Math.random() * 0.6).current; // 0.6 から 1.2 の範囲

  // 敵の形状をランダムに選択
  const enemyShape = useRef(Math.floor(Math.random() * 4)).current; // 0-3の4パターン

  const renderGeometry = () => {
    switch (enemyShape) {
      case 0:
        return <boxGeometry args={[randomSize, randomSize, randomSize]} />;
      case 1:
        return <sphereGeometry args={[randomSize * 0.7, 12, 12]} />;
      case 2:
        return <cylinderGeometry args={[randomSize * 0.6, randomSize * 0.6, randomSize, 8]} />;
      case 3:
        return <coneGeometry args={[randomSize * 0.7, randomSize * 1.2, 8]} />;
      default:
        return <boxGeometry args={[randomSize, randomSize, randomSize]} />;
    }
  };

  // IDが無効な場合は早期リターン
  if (!enemy.id || enemy.id === 'undefined') {
    console.error('Invalid enemy ID:', enemy.id);
    return null;
  }

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.position.z += enemy.velocity[2] * delta;
      meshRef.current.position.x += enemy.velocity[0] * delta;
      meshRef.current.position.y += enemy.velocity[1] * delta;

      // Rotate for visual effect
      meshRef.current.rotation.x += delta * rotationSpeed.x;
      meshRef.current.rotation.y += delta * rotationSpeed.y;
      meshRef.current.rotation.z += delta * rotationSpeed.z;

      // Remove enemy if it goes off screen (範囲を拡大)
      if (meshRef.current.position.z > 20) {
        removeEnemy(enemy.id);
        damagePlayer(10); // Player takes damage if enemy escapes
      }
    }
  });

  return (
    <mesh ref={meshRef} position={enemy.position}>
      {renderGeometry()}
      <meshStandardMaterial
        color={randomColor}
        emissive={randomColor}
        emissiveIntensity={0.4}
        flatShading
      />
    </mesh>
  );
});

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
    setGameState,
    damagePlayer,
    score
  } = useGameStore();

  // Shooting
  const shoot = useCallback(() => {
    if (gameState !== "playing") return;

    // 最も近い敵を見つける
    const enemyList = Object.values(enemies);

    if (enemyList.length === 0) {
      // 敵がいない場合は前方に撃つ
      const bulletId = nanoid();
      if (!bulletId) {
        console.error('Failed to generate bullet ID');
        return;
      }
      const bullet: Bullet = {
        id: bulletId,
        position: [player.position[0], player.position[1] + 0.5, player.position[2]],
        velocity: [0, 0, -100] // 速度を上げる
      };
      addBullet(bullet);
      return;
    }

    // プレイヤーの位置
    const playerPos = new THREE.Vector3(...player.position);

    // 最も近い敵を見つける
    let closestEnemy = enemyList[0];
    let closestDistance = Infinity;

    enemyList.forEach(enemy => {
      const enemyPos = new THREE.Vector3(...enemy.position);
      const distance = playerPos.distanceTo(enemyPos);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestEnemy = enemy;
      }
    });

    // 敵に向かってホーミング弾を1発撃つ
    const targetPos = new THREE.Vector3(...closestEnemy.position);
    const direction = targetPos.sub(playerPos).normalize();

    const bulletId = nanoid();
    if (!bulletId) {
      console.error('Failed to generate bullet ID');
      return;
    }

    const velocity: [number, number, number] = [
      direction.x * 100, // 速度を大幅に上げる
      direction.y * 100,
      direction.z * 100
    ];

    const bullet: Bullet = {
      id: bulletId,
      position: [player.position[0], player.position[1] + 0.5, player.position[2]],
      velocity,
      targetEnemyId: closestEnemy.id // ターゲットを記録
    };
    addBullet(bullet);
  }, [gameState, player.position, enemies, addBullet]);

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
      // スコアに応じて敵の出現数を調整（難易度上昇）
      const waveMultiplier = Math.floor(score / 200) + 1; // 200点ごとに難易度上昇
      const baseSpawnCount = Math.floor(Math.random() * 3) + 3; // 基本3-5体
      const spawnCount = Math.min(baseSpawnCount + waveMultiplier, 10); // 最大10体まで

      for (let i = 0; i < spawnCount; i++) {
        const enemyId = nanoid();
        if (!enemyId) {
          console.error('Failed to generate enemy ID');
          continue;
        }

        // より広い範囲に敵を配置
        const x = (Math.random() - 0.5) * 16; // X軸：左右16ユニット幅（2倍に拡大）
        const y = (Math.random() - 0.5) * 12; // Y軸：上下12ユニット幅（2倍に拡大）
        const z = -30 - (Math.random() * 20); // Z軸をランダムにして奥行きを持たせる

        const enemy: Enemy = {
          id: enemyId,
          position: [x, y, z],
          velocity: [
            (Math.random() - 0.5) * 1.5, // X軸の動きを速く
            (Math.random() - 0.5) * 1.0, // Y軸の動きを速く
            Math.random() * 2 + 2        // Z軸（前進）を速く：2-4の速度
          ],
          health: 1
        };
        addEnemy(enemy);
      }
    }, 400); // 出現間隔を400ms（0.4秒）に短縮！

    return () => clearInterval(spawnInterval);
  }, [gameState, addEnemy, score]);

  // Collision detection
  useFrame(() => {
    if (gameState !== "playing") return;

    // 無効な弾を削除
    Object.values(bullets).forEach(bullet => {
      if (!bullet.id || bullet.id === 'undefined') {
        removeBullet(bullet.id || 'undefined');
      }
    });

    // Check bullet-enemy collisions（ホーミング弾用）
    const bulletList = Object.values(bullets).filter(bullet => bullet.id && bullet.id !== 'undefined');
    for (const bullet of bulletList) {
      // 念のため再度IDをチェック
      if (!bullet.id || bullet.id === 'undefined') {
        continue;
      }

      let hitDetected = false;

      // ターゲットがある場合はそのターゲットのみとの衝突判定
      if (bullet.targetEnemyId && enemies[bullet.targetEnemyId]) {
        const targetEnemy = enemies[bullet.targetEnemyId];
        const bulletPos = new THREE.Vector3(...bullet.position);
        const enemyPos = new THREE.Vector3(...targetEnemy.position);
        const distance = bulletPos.distanceTo(enemyPos);

        if (distance < 2.0) { // 当たり判定を少し厳しく（3.0 → 2.0）
          removeBullet(bullet.id);
          removeEnemy(targetEnemy.id);
          addScore(10);
          hitDetected = true;
        }
      } else {
        // ターゲットがない場合は全ての敵との衝突判定（最初の1体のみ）
        const enemyList = Object.values(enemies);
        for (const enemy of enemyList) {
          const bulletPos = new THREE.Vector3(...bullet.position);
          const enemyPos = new THREE.Vector3(...enemy.position);
          const distance = bulletPos.distanceTo(enemyPos);

          if (distance < 2.0) { // 当たり判定を少し厳しく（3.0 → 2.0）
            removeBullet(bullet.id);
            removeEnemy(enemy.id);
            addScore(10);
            hitDetected = true;
            break; // 最初の1体のみ倒して終了
          }
        }
      }

      if (hitDetected) {
        continue; // この弾の処理は終了、次の弾へ
      }
    }

    // Check player-enemy collisions
    const playerPos = new THREE.Vector3(...player.position);
    Object.values(enemies).forEach(enemy => {
      const enemyPos = new THREE.Vector3(...enemy.position);

      if (playerPos.distanceTo(enemyPos) < 1.0) {
        removeEnemy(enemy.id);
        damagePlayer(10);
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

  // Memoize bullets and enemies to prevent unnecessary re-renders
  const bulletList = useMemo(() => {
    return Object.values(bullets).filter(bullet => bullet.id && bullet.id !== 'undefined');
  }, [bullets]);

  const enemyList = useMemo(() => {
    return Object.values(enemies).filter(enemy => enemy.id && enemy.id !== 'undefined');
  }, [enemies]);

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

      {bulletList.map((bullet, index) => (
        <BulletMesh key={`bullet-${bullet.id}-${index}`} bullet={bullet} />
      ))}

      {enemyList.map((enemy, index) => (
        <EnemyMesh key={`enemy-${enemy.id}-${index}`} enemy={enemy} />
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
        マウスで上下左右移動 | クリック/スペースで射撃（オートエイム）
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
