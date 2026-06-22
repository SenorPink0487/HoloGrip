import { Canvas, useThree, ThreeEvent, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useMemo, useRef, useLayoutEffect, useState } from 'react';

interface Experiment3DProps {
  Im: number;
  Is: number;
  probePos: number;
  probeTarget?: 'helmholtz' | 'solenoid';
  rightCoilPos: number;
  turns: number;
  setProbePos: (pos: number) => void;
  setRightCoilPos: (pos: number) => void;
  VH: number;
  setIm?: (val: number) => void;
  setIs?: (val: number) => void;
  connections: any[];
  setConnections: React.Dispatch<React.SetStateAction<any[]>>;
  imDirection?: number;
}

const TERMINAL_WORLD_POS: Record<string, [number, number, number]> = {
  solenoid_neg: [-13, -0.3, -6],
  solenoid_pos: [-11, -0.3, -6],
  helm_neg: [-13, -0.3, -2.5],
  helm_pos: [-11, -0.3, -2.5],
  im_out_neg: [-13, -0.3, 2],
  im_out_pos: [-11, -0.3, 2],
};

export function Experiment3D({ Im, Is, probePos, probeTarget, rightCoilPos, turns, setProbePos, setRightCoilPos, VH, setIm, setIs, connections, setConnections, imDirection = 1 }: Experiment3DProps) {
  const [draggingWire, setDraggingWire] = useState<{ startId: string; pos: [number, number, number]; color: string } | null>(null);

  const activeCoil = useMemo(() => {
    const connectedToImPos = connections.map(c => c.start === 'im_out_pos' ? c.end : (c.end === 'im_out_pos' ? c.start : null)).filter(Boolean);
    const connectedToImNeg = connections.map(c => c.start === 'im_out_neg' ? c.end : (c.end === 'im_out_neg' ? c.start : null)).filter(Boolean);
    if ((connectedToImPos.includes('helm_pos') || connectedToImPos.includes('helm_neg')) &&
        (connectedToImNeg.includes('helm_pos') || connectedToImNeg.includes('helm_neg'))) {
        return 'helmholtz';
    }
    if ((connectedToImPos.includes('solenoid_pos') || connectedToImPos.includes('solenoid_neg')) &&
        (connectedToImNeg.includes('solenoid_pos') || connectedToImNeg.includes('solenoid_neg'))) {
        return 'solenoid';
    }
    return null;
  }, [connections]);

  const startWireDrag = (id: string, color: string) => {
    setDraggingWire({ startId: id, pos: TERMINAL_WORLD_POS[id], color });
  };

  const updateWireDrag = (rawPos: [number, number, number]) => {
    if (draggingWire) {
      let finalPos = rawPos;
      // 吸附效果 (Snapping effect)
      for (const [id, terminalPos] of Object.entries(TERMINAL_WORLD_POS)) {
        if (id === draggingWire.startId) continue;
        const dx = terminalPos[0] - rawPos[0];
        const dy = terminalPos[1] - rawPos[1]; // Typically y=0 but better to be exact
        const dz = terminalPos[2] - rawPos[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 0.8) {
          finalPos = terminalPos;
          break;
        }
      }
      setDraggingWire({ ...draggingWire, pos: finalPos });
    }
  };

  const endWireDrag = (dropId?: string) => {
    let finalDropId = dropId;
    if (!finalDropId && draggingWire) {
      for (const [id, terminalPos] of Object.entries(TERMINAL_WORLD_POS)) {
        if (id !== draggingWire.startId && 
            draggingWire.pos[0] === terminalPos[0] && 
            draggingWire.pos[1] === terminalPos[1] && 
            draggingWire.pos[2] === terminalPos[2]) {
          finalDropId = id;
          break;
        }
      }
    }

    if (draggingWire && finalDropId && draggingWire.startId !== finalDropId) {
      const newConn = {
        id: `${draggingWire.startId}-${finalDropId}`,
        start: draggingWire.startId,
        end: finalDropId,
        color: draggingWire.color
      };
      setConnections(prev => {
        const filtered = prev.filter(c => c.start !== finalDropId && c.end !== finalDropId && c.start !== draggingWire.startId && c.end !== draggingWire.startId);
        return [...filtered, newConn];
      });
    }
    setDraggingWire(null);
  };
  
  const removeConnections = (id: string) => {
    setConnections(prev => prev.filter(c => c.start !== id && c.end !== id));
  };

  return (
    <Canvas camera={{ position: [0, 15, 25], fov: 45 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
      <pointLight position={[-10, 10, -10]} intensity={0.5} />
      
      {/* Invisible plane for wire dragging */}
      {draggingWire && (
        <mesh 
          position={[0, -0.3, 0]} 
          rotation={[-Math.PI / 2, 0, 0]} 
          onPointerMove={(e) => {
            e.stopPropagation();
            updateWireDrag([e.point.x, e.point.y, e.point.z]);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            endWireDrag();
          }}
        >
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} color="white" />
        </mesh>
      )}

      {/* Dynamic Wires */}
      {connections.map((conn) => {
        const start = TERMINAL_WORLD_POS[conn.start];
        const end = TERMINAL_WORLD_POS[conn.end];
        const controlFixed: [number, number, number] = [
          (start[0] + end[0]) / 2 - 2, // bulge outwards to the left
          Math.max(start[1], end[1]) + 3,
          (start[2] + end[2]) / 2
        ];
        return <WireCurve key={conn.id} start={start} end={end} color={conn.color} control={controlFixed} />;
      })}

      {/* Dragging Wire */}
      {draggingWire && (
         <WireCurve 
            start={TERMINAL_WORLD_POS[draggingWire.startId]} 
            end={draggingWire.pos} 
            color={draggingWire.color} 
            control={[
               (TERMINAL_WORLD_POS[draggingWire.startId][0] + draggingWire.pos[0]) / 2, 
               Math.max(TERMINAL_WORLD_POS[draggingWire.startId][1], draggingWire.pos[1]) + 2, 
               (TERMINAL_WORLD_POS[draggingWire.startId][2] + draggingWire.pos[2]) / 2
            ]} 
         />
      )}

      <OrbitControls 
        makeDefault
        enabled={!draggingWire}
        minPolarAngle={0} 
        maxPolarAngle={Math.PI / 2 + 0.1} 
        maxDistance={50}
        minDistance={10}
      />
      
      <group position={[0, -2, 0]}>
        {/* Instrument Case Base */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[32, 2, 20]} />
          <meshStandardMaterial color="#111111" roughness={0.9} />
        </mesh>

        {/* --- Top Deck (Slightly inclined flat board) --- */}
        <group position={[0, 1.05, 0]} rotation={[0, 0, 0]}>
          {/* Silver Top Plate */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[32, 0.1, 20]} />
            <meshStandardMaterial color="#e8e8e8" roughness={0.4} metalness={0.1} />
          </mesh>
          
          {/* Solenoid Mounts */}
          <mesh position={[-12, 0.55, -8.5]}>
             <boxGeometry args={[1.5, 1.1, 4]} />
             <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[12, 0.55, -8.5]}>
             <boxGeometry args={[1.5, 1.1, 4]} />
             <meshStandardMaterial color="#1a1a1a" />
          </mesh>

          {/* Terminals (Left Side) */}
          <group position={[-12, 0, -4]}>
             {/* Solenoid Terminals */}
             <BindingPost id="solenoid_neg" position={[-1, 0, -2]} color="#111" onStartDrag={startWireDrag} onDrop={endWireDrag} onRemove={removeConnections} />
             <BindingPost id="solenoid_pos" position={[1, 0, -2]} color="#c00" onStartDrag={startWireDrag} onDrop={endWireDrag} onRemove={removeConnections} />
             <Text position={[0, 0.06, -1]} rotation={[-Math.PI/2, 0, 0]} fontSize={0.3} color="#222">螺线管</Text>
             
             {/* Helmholtz Terminals */}
             <BindingPost id="helm_neg" position={[-1, 0, 1.5]} color="#111" onStartDrag={startWireDrag} onDrop={endWireDrag} onRemove={removeConnections} />
             <BindingPost id="helm_pos" position={[1, 0, 1.5]} color="#c00" onStartDrag={startWireDrag} onDrop={endWireDrag} onRemove={removeConnections} />
             <Text position={[0, 0.06, 2.5]} rotation={[-Math.PI/2, 0, 0]} fontSize={0.3} color="#222">亥姆霍兹线圈</Text>
             
             {/* Im Output Terminals */}
             <BindingPost id="im_out_neg" position={[-1, 0, 6]} color="#111" onStartDrag={startWireDrag} onDrop={endWireDrag} onRemove={removeConnections} />
             <BindingPost id="im_out_pos" position={[1, 0, 6]} color="#c00" onStartDrag={startWireDrag} onDrop={endWireDrag} onRemove={removeConnections} />
             <Text position={[0, 0.06, 7]} rotation={[-Math.PI/2, 0, 0]} fontSize={0.35} color="#222">励磁电流 Im 输出</Text>
          </group>

          {/* Main Title */}
          <Text position={[0, 0.06, 1.0]} rotation={[-Math.PI/2, 0, 0]} fontSize={0.9} color="#c00" anchorX="center" anchorY="middle" letterSpacing={0.1}>
             HCC-2型 霍尔效应测磁仪
          </Text>

          {/* Displays (Flat on board) */}
          <Screen position={[-7.5, 0.06, 4.0]} rotation={[-Math.PI/2, 0, 0]} value={(activeCoil ? Im : 0).toFixed(3)} label="励磁电流 Im(A)" />
          <Screen position={[0, 0.06, 4.0]} rotation={[-Math.PI/2, 0, 0]} value={Is.toFixed(2)} label="霍尔电流 Is(mA)" />
          <Screen position={[7.5, 0.06, 4.0]} rotation={[-Math.PI/2, 0, 0]} value={(VH * 1000).toFixed(1)} label="霍尔电压 VH(mV)" />

          {/* Knobs */}
          <Knob position={[-8, 0.06, 8.5]} rotation={[-Math.PI/2, 0, 0]} label="Im 调节" onInteract={setIm} value={Im} step={0.01} min={0} max={1} />
          <Knob position={[0, 0.06, 8.5]} rotation={[-Math.PI/2, 0, 0]} label="Is 调节" onInteract={setIs} value={Is} step={0.1} min={0} max={10} />
          <Knob position={[8, 0.06, 8.5]} rotation={[-Math.PI/2, 0, 0]} label="VH 调零" />
        </group>

        {/* --- Front Suitcase Latches and Handle --- */}
        <group position={[0, 0, 10.2]}>
           {/* Handle */}
           <mesh position={[0, 0, 0]}>
             <boxGeometry args={[4, 0.6, 0.4]} />
             <meshStandardMaterial color="#cccccc" metalness={0.6} roughness={0.4} />
           </mesh>
           {/* Latches */}
           <mesh position={[-8, 0, 0]}>
             <boxGeometry args={[1, 1.2, 0.3]} />
             <meshStandardMaterial color="#cccccc" metalness={0.6} roughness={0.4} />
           </mesh>
           <mesh position={[8, 0, 0]}>
             <boxGeometry args={[1, 1.2, 0.3]} />
             <meshStandardMaterial color="#cccccc" metalness={0.6} roughness={0.4} />
           </mesh>
        </group>

        {/* Helmholtz Coils */}
        <HelmholtzCoil position={[-2.5, 4.5, -2]} />
        <DraggableRightCoil rightCoilPos={rightCoilPos} setRightCoilPos={setRightCoilPos} />
        {activeCoil === 'helmholtz' && <MagneticFieldLines rightCoilPos={rightCoilPos} Im={Im} dir={imDirection} />}

        {/* Central Transparent Tube & Ruler */}
        <group position={[1, 4.5, -2]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.8, 0.8, 25, 32]} />
            <meshPhysicalMaterial 
              color="#ffffff" 
              transparent 
              opacity={0.2} 
              roughness={0.1} 
              side={THREE.DoubleSide} 
              depthWrite={false}
            />
          </mesh>
        </group>

        {/* Probe & Rod (Animated to target) */}
        <AnimatedProbeRod target={probeTarget || 'helmholtz'} probePos={probePos} setProbePos={setProbePos} />

        {/* Solenoid (Top Back) */}
        <Solenoid position={[0, 3.65, -8.5]} rotation={[0, 0, Math.PI / 2]} turns={turns} />
        {activeCoil === 'solenoid' && <MagneticFieldLinesSolenoid Im={Im} dir={imDirection} />}
      </group>
    </Canvas>
  );
}

function Screen({ position, rotation, value, label }: { position: [number, number, number], rotation?: [number, number, number], value: string, label: string }) {
  return (
    <group position={position} rotation={rotation || [0, 0, 0]}>
      {/* Frame */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[6.5, 3.5, 0.3]} />
        <meshStandardMaterial color="#666666" roughness={0.6} />
      </mesh>
      {/* Screen Glass */}
      <mesh position={[0, 0, 0.1]}>
        <boxGeometry args={[5.5, 2.5, 0.1]} />
        <meshStandardMaterial color="#1a0000" roughness={0.1} />
      </mesh>
      {/* The number (Simulated 7-segment LED look) */}
      <Text position={[0, 0, 0.16]} fontSize={1.6} color="#ff1111" anchorX="center" anchorY="middle" letterSpacing={0.1}>
        {value}
      </Text>
      {/* Label under the screen */}
      <Text position={[0, -2.0, 0.01]} fontSize={0.5} color="#222" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#fff">
        {label}
      </Text>
    </group>
  );
}

function BindingPost({ id, position, color, onStartDrag, onDrop, onRemove }: { id: string, position: [number, number, number], color: string, onStartDrag: (id: string, color: string) => void, onDrop: (id: string) => void, onRemove: (id: string) => void }) {
  return (
    <group 
      position={position}
      onPointerDown={(e) => {
        e.stopPropagation();
        onStartDrag(id, color);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onDrop(id);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onRemove(id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'crosshair';
      }}
      onPointerOut={(e) => {
        document.body.style.cursor = 'auto';
      }}
    >
       {/* Base */}
       <mesh position={[0, 0.2, 0]}>
         <cylinderGeometry args={[0.3, 0.3, 0.4, 16]} />
         <meshStandardMaterial color="#333" />
       </mesh>
       {/* Cap */}
       <mesh position={[0, 0.5, 0]}>
         <cylinderGeometry args={[0.25, 0.25, 0.3, 16]} />
         <meshStandardMaterial color={color} />
       </mesh>
       <mesh position={[0, 0.65, 0]}>
         <cylinderGeometry args={[0.15, 0.15, 0.3, 16]} />
         <meshStandardMaterial color="#888" metalness={0.8} />
       </mesh>
    </group>
  );
}

function Knob({ position, rotation, label, onInteract, value = 0, step = 1, min = 0, max = 10 }: { position: [number, number, number], rotation?: [number, number, number], label: string, onInteract?: (val: number) => void, value?: number, step?: number, min?: number, max?: number }) {
   const { controls } = useThree();

   const handlePointerDown = (e: any) => {
      if (!onInteract) return;
      e.stopPropagation();
      if (controls) (controls as any).enabled = false;
      document.body.style.cursor = 'ew-resize';
      const startX = e.clientX;
      const startVal = value;
      
      const onMove = (moveEvent: MouseEvent) => {
         const dx = moveEvent.clientX - startX;
         // 10 pixels per step
         const steps = Math.floor(dx / 10);
         let newVal = startVal + steps * step;
         newVal = Math.max(min, Math.min(max, newVal));
         onInteract(newVal);
      };
      
      const onUp = () => {
         if (controls) (controls as any).enabled = true;
         window.removeEventListener('mousemove', onMove);
         window.removeEventListener('mouseup', onUp);
         document.body.style.cursor = 'auto';
      };
      
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
   };

   // Calculate rotation based on value mapped between -135deg and +135deg
   const progress = (value - min) / (max - min || 1);
   const rotationZ = -(progress * Math.PI * 1.5 - Math.PI * 0.75); // Negative so it turns right for positive

   return (
      <group position={position} rotation={rotation || [0, 0, 0]}>
         <group rotation={[0, 0, rotationZ]} onPointerDown={handlePointerDown}>
           {/* Knob Base (Grooved area) */}
           <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 0, 0.2]}>
             <cylinderGeometry args={[0.85, 0.85, 0.4, 32]} />
             <meshStandardMaterial color="#b0b5ba" roughness={0.4} metalness={0.1} />
           </mesh>
           
           {/* Vertical ridges around the knob */}
           {Array.from({ length: 36 }).map((_, i) => {
             const ang = (i / 36) * Math.PI * 2;
             return (
               <mesh key={i} rotation={[Math.PI/2, 0, 0]} position={[Math.sin(ang) * 0.84, Math.cos(ang) * 0.84, 0.2]}>
                 <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
                 <meshStandardMaterial color="#b0b5ba" roughness={0.4} metalness={0.1} />
               </mesh>
             );
           })}

           {/* Knob Top Bevel */}
           <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 0, 0.45]}>
             <cylinderGeometry args={[0.8, 0.85, 0.1, 32]} />
             <meshStandardMaterial color="#b0b5ba" roughness={0.3} metalness={0.1} />
           </mesh>

           {/* Knob Top Flat Surface */}
           <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 0, 0.5]}>
             <cylinderGeometry args={[0.8, 0.8, 0.02, 32]} />
             <meshStandardMaterial color="#b0b5ba" roughness={0.3} metalness={0.1} />
           </mesh>

           {/* Indicator dot */}
           <mesh position={[0, 0.6, 0.5]}>
             <sphereGeometry args={[0.06, 16, 16]} />
             <meshStandardMaterial color="#ffffff" roughness={0.2} />
           </mesh>
         </group>
         <Text position={[0, -1.2, 0.01]} fontSize={0.4} color="#222" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#fff">
           {label}
         </Text>
      </group>
   );
}

function WireCurve({ start, end, color, control }: { start: [number, number, number], end: [number, number, number], color: string, control: [number, number, number] }) {
  const curve = useMemo(() => {
    return new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...start),
      new THREE.Vector3(...control),
      new THREE.Vector3(...end)
    );
  }, [start, end, control]);

  return (
    <mesh>
      <tubeGeometry args={[curve, 20, 0.1, 8, false]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  );
}

function DraggableRightCoil({ rightCoilPos, setRightCoilPos }: { rightCoilPos: number, setRightCoilPos: (pos: number) => void }) {
  const { controls } = useThree();

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    if (controls) (controls as any).enabled = false;
    document.body.style.cursor = 'ew-resize';
    const startX = e.clientX;
    const startPos = rightCoilPos;

    const onMove = (moveEvent: MouseEvent) => {
       const dx = moveEvent.clientX - startX;
       // Assuming dragging horizontally translates roughly 0.05 units per px
       let newPos = startPos + dx * 0.02; // slower for coil
       newPos = Math.max(-0.5, Math.min(13, newPos)); // clamp to reasonable positions
       setRightCoilPos(newPos);
    };

    const onUp = () => {
       if (controls) (controls as any).enabled = true;
       window.removeEventListener('mousemove', onMove);
       window.removeEventListener('mouseup', onUp);
       document.body.style.cursor = 'auto';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <group onPointerDown={handlePointerDown} position={[rightCoilPos, 4.5, -2]}>
      <HelmholtzCoil position={[0, 0, 0]} />
      {/* Invisible grab handle to make grabbing easier */}
      <mesh visible={false}>
        <boxGeometry args={[2, 6, 6]} />
        <meshBasicMaterial transparent opacity={0.1} />
      </mesh>
    </group>
  );
}

function HelmholtzCoil({ position }: { position: [number, number, number] }) {
  const widthTurns = 20;
  const layerTurns = 12;
  const totalTurns = widthTurns * layerTurns;
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const width = 1.0;
    const stepW = width / widthTurns;

    const baseRadius = 2.5;
    const stepR = (3.3 - 2.5) / layerTurns;

    let idx = 0;
    for (let layer = 0; layer < layerTurns; layer++) {
      const currentRadius = baseRadius + layer * stepR;
      for (let w = 0; w < widthTurns; w++) {
         dummy.position.set(0, -width/2 + w * stepW + stepW/2, 0);
         dummy.rotation.set(Math.PI / 2, 0, 0);
         dummy.scale.set(currentRadius, currentRadius, currentRadius);
         dummy.updateMatrix();
         meshRef.current.setMatrixAt(idx++, dummy.matrix);
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group position={position}>
      <group rotation={[0, 0, Math.PI / 2]}>
        {/* Inner Acrylic Drum */}
        <mesh>
          <cylinderGeometry args={[2.4, 2.4, 1.2, 64, 1, true]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.2} roughness={0.1} transmission={0.9} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        
        {/* Flanges (Thick transparent plates) */}
        <mesh position={[0, -0.6, 0]} rotation={[Math.PI/2, 0, 0]}>
          <ringGeometry args={[2.4, 3.8, 64]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.2} roughness={0.1} transmission={0.9} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.6, 0]} rotation={[Math.PI/2, 0, 0]}>
          <ringGeometry args={[2.4, 3.8, 64]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.2} roughness={0.1} transmission={0.9} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>

        {/* Wire turns, instantiated as concentric bands */}
        <instancedMesh ref={meshRef} args={[undefined, undefined, totalTurns]}>
          <torusGeometry args={[1, 0.015, 6, 48]} />
          <meshStandardMaterial color="#c87a3e" metalness={0.8} roughness={0.4} />
        </instancedMesh>
      </group>
      
      {/* Acrylic Support Stand */}
      <mesh position={[0, -2.95, 0]}>
        <boxGeometry args={[1.5, 0.9, 1.5]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.4} roughness={0.2} transmission={0.8} />
      </mesh>
    </group>
  );
}

function Solenoid({ position, rotation, turns }: { position: [number, number, number], rotation: [number, number, number], turns: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const length = 26;
    const actualTurns = turns;
    const step = length / actualTurns;
    
    for (let i = 0; i < actualTurns; i++) {
       dummy.position.set(0, -length/2 + i * step + step/2, 0);
       dummy.rotation.set(Math.PI / 2, 0, 0);
       dummy.updateMatrix();
       meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.count = actualTurns;
  }, [turns]);

  return (
    <group position={position} rotation={rotation}>
      {/* Hollow inner tube (Acrylic) */}
      <mesh>
        <cylinderGeometry args={[1.4, 1.4, 26, 64, 1, true]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.2} roughness={0.05} transmission={1.0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Wire turns, dynamic thickness based on turns amount */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, 3000]}>
        <torusGeometry args={[1.45, Math.min(0.2, (26 / turns) * 0.45), 8, 32]} />
        <meshStandardMaterial color="#c87a3e" metalness={0.8} roughness={0.4} />
      </instancedMesh>
      
      {/* Transparent Acrylic Tube */}
      <mesh rotation={[0, 0, 0]}>
        <cylinderGeometry args={[1.4, 1.4, 27.2, 32, 1, true]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.15} roughness={0.1} clearcoat={1.0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Detailed Solenoid Brackets (End Caps) */}
      {/* Right Bracket (at local y = 13.3) */}
      <group position={[0, 13.3, 0]}>
        <mesh rotation={[0, 0, 0]}>
          <cylinderGeometry args={[1.75, 1.75, 1.0, 32, 1, true]} />
          <meshStandardMaterial color="#111111" roughness={1.0} metalness={0.0} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[0, 0, 0]}>
          <cylinderGeometry args={[1.42, 1.42, 1.0, 32, 1, true]} />
          <meshStandardMaterial color="#111111" roughness={1.0} metalness={0.0} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 0.5, 0]}>
          <ringGeometry args={[1.42, 1.75, 32]} />
          <meshStandardMaterial color="#111111" roughness={1.0} metalness={0.0} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI/2, 0, 0]} position={[0, -0.5, 0]}>
          <ringGeometry args={[1.42, 1.75, 32]} />
          <meshStandardMaterial color="#111111" roughness={1.0} metalness={0.0} side={THREE.DoubleSide} />
        </mesh>
        {/* Bracket Base downward to the table */}
        <mesh position={[-2.05, 0, 0]}>
          <boxGeometry args={[1.15, 1.0, 3.5]} />
          <meshStandardMaterial color="#111111" roughness={1.0} metalness={0.0} />
        </mesh>
      </group>

      {/* Left Bracket (at local y = -13.3) */}
      <group position={[0, -13.3, 0]}>
        <mesh rotation={[0, 0, 0]}>
          <cylinderGeometry args={[1.75, 1.75, 1.0, 32, 1, true]} />
          <meshStandardMaterial color="#111111" roughness={1.0} metalness={0.0} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[0, 0, 0]}>
          <cylinderGeometry args={[1.42, 1.42, 1.0, 32, 1, true]} />
          <meshStandardMaterial color="#111111" roughness={1.0} metalness={0.0} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 0.5, 0]}>
          <ringGeometry args={[1.42, 1.75, 32]} />
          <meshStandardMaterial color="#111111" roughness={1.0} metalness={0.0} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI/2, 0, 0]} position={[0, -0.5, 0]}>
          <ringGeometry args={[1.42, 1.75, 32]} />
          <meshStandardMaterial color="#111111" roughness={1.0} metalness={0.0} side={THREE.DoubleSide} />
        </mesh>
        {/* Bracket Base downward to the table */}
        <mesh position={[-2.05, 0, 0]}>
          <boxGeometry args={[1.15, 1.0, 3.5]} />
          <meshStandardMaterial color="#111111" roughness={1.0} metalness={0.0} />
        </mesh>
      </group>
    </group>
  );
}

function AnimatedProbeRod({ target, probePos, setProbePos }: { target: 'helmholtz' | 'solenoid', probePos: number, setProbePos: (pos: number) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  
  // Solenoid is at Y=3.65, Z=-8.5
  // Helmholtz is at Y=4.5, Z=-2.0
  // X=1.0 for both bases to align the ruler
  const targetPos = target === 'solenoid' ? new THREE.Vector3(1.0, 3.65, -8.5) : new THREE.Vector3(1.0, 4.5, -2.0);

  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.position.lerp(targetPos, 5 * delta);
    }
  });

  return (
    <group ref={groupRef}>
      <ProbeRod probePos={probePos} setProbePos={setProbePos} />
    </group>
  );
}

function ProbeRod({ probePos, setProbePos }: { probePos: number, setProbePos: (pos: number) => void }) {
  const { controls } = useThree();

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    if (controls) (controls as any).enabled = false;
    document.body.style.cursor = 'ew-resize';
    const startX = e.clientX;
    const startPos = probePos;

    const onMove = (moveEvent: MouseEvent) => {
       const dx = moveEvent.clientX - startX;
       // Assuming dragging horizontally translates roughly 0.05 units per px
       let newPos = startPos + dx * 0.05;
       newPos = Math.max(-15, Math.min(15, newPos));
       setProbePos(newPos);
    };

    const onUp = () => {
       if (controls) (controls as any).enabled = true;
       window.removeEventListener('mousemove', onMove);
       window.removeEventListener('mouseup', onUp);
       document.body.style.cursor = 'auto';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <group 
      position={[probePos + 12.5, 0, 0]} 
      onPointerDown={handlePointerDown}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'grab'; }}
      onPointerOut={(e) => { document.body.style.cursor = 'auto'; }}
    >
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[25, 0.4, 0.8]} />
        <meshStandardMaterial color="#eeeeee" roughness={0.6} />
      </mesh>
      
      {/* Scale Markings on Rod */}
      {Array.from({ length: 241 }).map((_, i) => {
         const isCm = i % 10 === 0;
         const isHalfCm = i % 5 === 0 && !isCm;
         const lineLength = isCm ? 0.3 : isHalfCm ? 0.2 : 0.12;
         const zOffset = 0.4 - lineLength / 2;
         
         return (
           <group key={i} position={[-12 + i * 0.1, 0.1, 0]}>
             <mesh position={[0, 0.01, zOffset]}>
                <boxGeometry args={[0.015, 0.02, lineLength]} />
                <meshBasicMaterial color="#222" />
             </mesh>
             {isCm && i > 0 && (
               <Text 
                 position={[0, 0.03, -0.2]} 
                 rotation={[-Math.PI / 2, 0, 0]} 
                 fontSize={0.35} 
                 color="#000000"
                 anchorX="center"
                 anchorY="middle"
               >
                 {String(i / 10)}
               </Text>
             )}
           </group>
         );
      })}

      <mesh position={[-12.5, 0, 0]}>
         <boxGeometry args={[1, 0.6, 0.6]} />
         <meshStandardMaterial color="#222222" />
      </mesh>
      {/* Red sensor tip */}
      <mesh position={[-13, 0, 0]}>
         <boxGeometry args={[0.1, 0.4, 0.4]} />
         <meshStandardMaterial color="red" />
      </mesh>
    </group>
  );
}

function getBFieldOffset(x: number, yPrime: number, cx: number, R: number) {
   let bx = 0;
   let by = 0;
   const N = 32;
   const dTheta = 2 * Math.PI / N;
   for (let i = 0; i < N; i++) {
       const theta = i * dTheta;
       const cosT = Math.cos(theta);
       const D = Math.pow(x - cx, 2) + Math.pow(yPrime, 2) + Math.pow(R, 2) - 2 * R * yPrime * cosT;
       const D15 = Math.pow(Math.max(D, 0.01), 1.5);
       bx += (R * R - R * yPrime * cosT) / D15 * dTheta;
       by += (R * cosT * (x - cx)) / D15 * dTheta;
   }
   return { bx, by };
}

function getTotalBField(x: number, y: number, rightCoilPos: number) {
    const yPrime = y - 4.5;
    const R = 2.9;
    const { bx: bx1, by: by1 } = getBFieldOffset(x, yPrime, -2.5, R);
    const { bx: bx2, by: by2 } = getBFieldOffset(x, yPrime, rightCoilPos, R);
    return { bx: bx1 + bx2, by: by1 + by2 };
}

function FlowingLine({ pts, opacity, dir = 1 }: { pts: THREE.Vector3[], opacity: number, dir?: number }) {
    const ref = useRef<any>(null);
    useFrame((_, delta) => {
        if (ref.current && ref.current.material) {
            ref.current.material.dashOffset -= delta * 3.0 * dir; // Flow direction
        }
    });
    return (
        <Line 
           ref={ref}
           points={pts} 
           color="#38bdf8"
           lineWidth={2}
           transparent
           opacity={opacity}
           dashed={true}
           dashSize={0.8}
           dashScale={1}
           dashOffset={0}
           gapSize={0.8}
        />
    );
}

function MagneticFieldLines({ rightCoilPos, Im, dir }: { rightCoilPos: number, Im: number, dir: number }) {
    const lines = useMemo(() => {
        const generatedLines: THREE.Vector3[][] = [];
        const stepSize = 0.2;
        const maxSteps = 200;

        const traceLine = (startX: number, startY: number) => {
            const forward: THREE.Vector3[] = [];
            const backward: THREE.Vector3[] = [];
            
            let cx = startX, cy = startY;
            for(let i=0; i<maxSteps; i++) {
                forward.push(new THREE.Vector3(cx, cy, -2));
                const {bx, by} = getTotalBField(cx, cy, rightCoilPos);
                const mag = Math.sqrt(bx*bx + by*by);
                if (mag < 1e-6) break;
                cx += (bx / mag) * stepSize;
                cy += (by / mag) * stepSize;
                if (cx < -15 || cx > 20 || cy < 0 || cy > 10) break;
            }

            cx = startX; cy = startY;
            for(let i=0; i<maxSteps; i++) {
                if (i > 0) backward.push(new THREE.Vector3(cx, cy, -2));
                const {bx, by} = getTotalBField(cx, cy, rightCoilPos);
                const mag = Math.sqrt(bx*bx + by*by);
                if (mag < 1e-6) break;
                cx -= (bx / mag) * stepSize;
                cy -= (by / mag) * stepSize;
                if (cx < -15 || cx > 20 || cy < 0 || cy > 10) break;
            }
            return [...backward.reverse(), ...forward];
        };

        const seeds: {x:number, y:number}[] = [];
        const dys = [0.2, 0.6, 1.3, 1.8, 2.5, -0.2, -0.6, -1.3, -1.8, -2.5];
        dys.forEach(dy => {
            seeds.push({x: -2.5, y: 4.5 + dy});
            seeds.push({x: rightCoilPos, y: 4.5 + dy});
        });

        seeds.forEach(seed => {
            const pts = traceLine(seed.x, seed.y);
            if (pts.length > 5) {
               generatedLines.push(pts);
            }
        });
        return generatedLines;
    }, [rightCoilPos]);

    if (Im <= 0.01) return null;

    return (
        <group>
           {lines.map((pts, i) => (
               <FlowingLine key={`helm-${i}`} pts={pts} opacity={Math.min(1.0, Im * 1.5) * 0.7} dir={dir} />
           ))}
        </group>
    );
}

function getSolenoidBFieldTotal(x: number, y: number) {
    const yPrime = y - 3.65;
    const R = 1.4;
    let bx = 0;
    let by = 0;
    // Proximate solenoid with 27 loops
    for (let cx = -13; cx <= 13.01; cx += 1.0) {
        const { bx: bxi, by: byi } = getBFieldOffset(x, yPrime, cx, R);
        bx += bxi;
        by += byi;
    }
    return { bx, by };
}

function MagneticFieldLinesSolenoid({ Im, dir }: { Im: number, dir: number }) {
    const lines = useMemo(() => {
        const generatedLines: THREE.Vector3[][] = [];
        const stepSize = 0.2;
        const maxSteps = 250;

        const traceLine = (startX: number, startY: number) => {
            const forward: THREE.Vector3[] = [];
            const backward: THREE.Vector3[] = [];
            
            let cx = startX, cy = startY;
            for(let i=0; i<maxSteps; i++) {
                forward.push(new THREE.Vector3(cx, cy, -8.5));
                const {bx, by} = getSolenoidBFieldTotal(cx, cy);
                const mag = Math.sqrt(bx*bx + by*by);
                if (mag < 1e-6) break;
                cx += (bx / mag) * stepSize;
                cy += (by / mag) * stepSize;
                if (cx < -20 || cx > 20 || cy < -5 || cy > 15) break;
            }

            cx = startX; cy = startY;
            for(let i=0; i<maxSteps; i++) {
                if (i > 0) backward.push(new THREE.Vector3(cx, cy, -8.5));
                const {bx, by} = getSolenoidBFieldTotal(cx, cy);
                const mag = Math.sqrt(bx*bx + by*by);
                if (mag < 1e-6) break;
                cx -= (bx / mag) * stepSize;
                cy -= (by / mag) * stepSize;
                if (cx < -20 || cx > 20 || cy < -5 || cy > 15) break;
            }
            return [...backward.reverse(), ...forward];
        };

        const seeds: {x:number, y:number}[] = [];
        const dys = [0.1, 0.4, 0.8, 1.2, -0.4, -0.8];
        const dxs = [-13, 0, 13];
        dys.forEach(dy => {
            dxs.forEach(dx => {
                seeds.push({x: dx, y: 3.65 + dy});
            });
        });

        seeds.forEach(seed => {
            const pts = traceLine(seed.x, seed.y);
            if (pts.length > 5) {
               generatedLines.push(pts);
            }
        });
        return generatedLines;
    }, []);

    if (Im <= 0.01) return null;

    return (
        <group>
           {lines.map((pts, i) => (
               <FlowingLine key={`sol-${i}`} pts={pts} opacity={Math.min(1.0, Im * 1.5) * 0.7} dir={dir} />
           ))}
        </group>
    );
}
