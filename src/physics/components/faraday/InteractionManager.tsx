import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { HandData } from '../../hooks/useHandTracking';

import { PhysicsDataRecord } from './FaradayDataPanel';

export interface InteractionManagerProps {
  handsDataRef: React.MutableRefObject<HandData[]>;
  magnetRef: React.MutableRefObject<THREE.Group | null>;
  solenoidRef: React.MutableRefObject<THREE.Group | null>;
  compassRef?: React.MutableRefObject<THREE.Group | null>;
  lightBulbRef?: React.MutableRefObject<THREE.Group | null>;
  galvanometerRef?: React.MutableRefObject<THREE.Group | null>;
  batteryRef?: React.MutableRefObject<THREE.Group | null>;
  onMagnetMove: (x: number) => void;
  onSolenoidMove: (x: number) => void;
  rightDragSensitivity: number;
  leftRotateSensitivity: number;
  zoomSensitivity: number;
  leftLightRef?: React.RefObject<THREE.PointLight | null>;
  rightLightRef?: React.RefObject<THREE.PointLight | null>;
  
  coils?: number;
  radius?: number;
  metersPerUnit?: number;
  baseMagneticField?: number;
  wireResistance?: number;
  setRecordedData?: (d: PhysicsDataRecord[]) => void;
  isRecordingForce?: boolean;
  inducedCurrentRef?: React.MutableRefObject<number>;
  temperature?: number;
  magnetStrength?: number;
  solenoidCurrent?: number;
  onVisualCurrentChange?: (current: number) => void;
}

export const InteractionManager: React.FC<InteractionManagerProps> = ({ 
  handsDataRef, magnetRef, solenoidRef, compassRef, lightBulbRef, galvanometerRef, batteryRef, onMagnetMove, onSolenoidMove,
  rightDragSensitivity, leftRotateSensitivity, zoomSensitivity,
  leftLightRef, rightLightRef,
  coils = 30, radius = 1.5, metersPerUnit = 0.01, baseMagneticField = 1.2, wireResistance = 0.5, setRecordedData, isRecordingForce, inducedCurrentRef,
  temperature = 20, magnetStrength = 1.0, solenoidCurrent = 0, onVisualCurrentChange
}) => {
  const { camera, gl } = useThree();
  
  const isMouseDown = useRef(false);
  const mouseDragTarget = useRef<'none' | 'magnet' | 'solenoid' | 'compass' | 'lightbulb' | 'galvanometer' | 'battery' | 'background'>('none');
  const mouseLastX = useRef(0);
  const mouseLastY = useRef(0);
  const raycaster = useRef(new THREE.Raycaster());
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const dragOffset = useRef(new THREE.Vector3());

  useEffect(() => {
    const canvas = gl.domElement;

    const getNormalizedMouse = (e: any) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      return { x, y };
    };

    const handlePointerDown = (e: any) => {
      isMouseDown.current = true;
      mouseLastX.current = e.clientX;
      mouseLastY.current = e.clientY;

      const { x, y } = getNormalizedMouse(e);
      raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
      
      const checkDrag = (ref: React.MutableRefObject<THREE.Group | null> | undefined, name: string) => {
        if (ref?.current) {
          const intersects = raycaster.current.intersectObject(ref.current, true);
          if (intersects.length > 0) {
            mouseDragTarget.current = name as any;
            
            if (['compass', 'lightbulb', 'galvanometer', 'battery'].includes(name)) {
              // 器材在 XZ 平面上拖拽
              dragPlane.current.set(new THREE.Vector3(0, 1, 0), -ref.current.position.y);
            } else {
              // 磁铁/线圈在 XY 平面上拖拽
              dragPlane.current.set(new THREE.Vector3(0, 0, 1), -ref.current.position.z);
            }
            
            const target = new THREE.Vector3();
            raycaster.current.ray.intersectPlane(dragPlane.current, target);
            if (target) {
              dragOffset.current.subVectors(target, ref.current.position);
            }
            return true;
          }
        }
        return false;
      };

      if (checkDrag(magnetRef, 'magnet')) return;
      if (checkDrag(solenoidRef, 'solenoid')) return;
      if (checkDrag(compassRef, 'compass')) return;
      if (checkDrag(lightBulbRef, 'lightbulb')) return;
      if (checkDrag(galvanometerRef, 'galvanometer')) return;
      if (checkDrag(batteryRef, 'battery')) return;
      
      mouseDragTarget.current = 'background';
    };

    const handlePointerMove = (e: any) => {
      if (!isMouseDown.current) return;

      const deltaX = e.clientX - mouseLastX.current;
      const deltaY = e.clientY - mouseLastY.current;
      mouseLastX.current = e.clientX;
      mouseLastY.current = e.clientY;

      if (mouseDragTarget.current === 'background') {
        currentYaw.current -= deltaX * 0.005 * leftRotateSensitivity;
        currentPitch.current -= deltaY * 0.005 * leftRotateSensitivity;
        currentPitch.current = Math.min(0, Math.max(-Math.PI / 2, currentPitch.current));
      } else {
        const { x, y } = getNormalizedMouse(e);
        raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
        const target = new THREE.Vector3();
        raycaster.current.ray.intersectPlane(dragPlane.current, target);
        
        if (target) {
          const newPos = target.clone().sub(dragOffset.current);
          
          if (mouseDragTarget.current === 'magnet' && magnetRef.current) {
            magnetRef.current.position.x = Math.max(-15, Math.min(15, newPos.x));
            if (targetMagnetX) targetMagnetX.current = magnetRef.current.position.x;
            if (Math.abs(magnetRef.current.position.x - lastReportedMagnetX.current) > 0.01) {
              lastReportedMagnetX.current = magnetRef.current.position.x;
              onMagnetMove(magnetRef.current.position.x);
            }
          } else if (mouseDragTarget.current === 'solenoid' && solenoidRef.current) {
            solenoidRef.current.position.x = Math.max(-15, Math.min(15, newPos.x));
            if (Math.abs(solenoidRef.current.position.x - lastReportedSolenoidX.current) > 0.01) {
              lastReportedSolenoidX.current = solenoidRef.current.position.x;
              onSolenoidMove(solenoidRef.current.position.x);
            }
          } else {
            let ref;
            if (mouseDragTarget.current === 'compass') ref = compassRef;
            if (mouseDragTarget.current === 'lightbulb') ref = lightBulbRef;
            if (mouseDragTarget.current === 'galvanometer') ref = galvanometerRef;
            if (mouseDragTarget.current === 'battery') ref = batteryRef;
            
            if (ref && ref.current) {
               ref.current.position.x = Math.max(-15, Math.min(15, newPos.x));
               ref.current.position.z = Math.max(-15, Math.min(15, newPos.z));
            }
          }
        }
      }
    };

    const handlePointerUp = () => {
      isMouseDown.current = false;
      mouseDragTarget.current = 'none';
    };

    const handleWheel = (e: any) => {
      const zoomDelta = e.deltaY * 0.01 * zoomSensitivity;
      cameraRadius.current = Math.max(2, Math.min(40, cameraRadius.current + zoomDelta));
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('wheel', handleWheel);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [camera, gl, leftRotateSensitivity, rightDragSensitivity, zoomSensitivity, onMagnetMove, magnetRef]);

  // 视角控制的状态
  const cameraRadius = useRef(10);
  const targetCameraPos = useRef(new THREE.Vector3(0, 0, 10));
  const currentCameraPos = useRef(new THREE.Vector3(0, 0, 10));
  const pinchStartHandsDist = useRef(-1);
  const pinchStartRadius = useRef(10);
  const rightPinchStartX = useRef(-1);
  const rightPinchStartMagnetX = useRef(0);
  const targetMagnetX = useRef<number | null>(null);
  const lastReportedMagnetX = useRef(4);
  const lastReportedSolenoidX = useRef(0);
  const rightPinchLossStartTime = useRef(-1);
  const doublePinchLossStartTime = useRef(-1);

  // 左手单指捏合拖拽控制旋转的状态
  const leftPinchStartX = useRef(-1);
  const leftPinchStartY = useRef(-1);
  const currentYaw = useRef(0);
  const currentPitch = useRef(0);
  const startYaw = useRef(0);
  const startPitch = useRef(0);

  const getFingerCurlRatio = (landmarks: any[], joints: number[]) => {
    const getDist3D = (a: any, b: any) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = (a.z ?? 0) - (b.z ?? 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };
    const mcp = landmarks[joints[0]];
    const pip = landmarks[joints[1]];
    const dip = landmarks[joints[2]];
    const tip = landmarks[joints[3]];

    const totalLength = getDist3D(mcp, pip) + getDist3D(pip, dip) + getDist3D(dip, tip);
    const straightLength = getDist3D(mcp, tip);
    return totalLength > 0 ? (straightLength / totalLength) : 1;
  };

  const isPinching = (landmarks: any[]) => {
    const dx = landmarks[4].x - landmarks[8].x;
    const dy = landmarks[4].y - landmarks[8].y;
    const isThumbIndexClose = Math.sqrt(dx * dx + dy * dy) < 0.08;
    
    // 如果食指弯曲程度过大（比例小于0.75），说明可能在握拳，不判定为捏合
    const indexRatio = getFingerCurlRatio(landmarks, [5, 6, 7, 8]);
    return isThumbIndexClose && indexRatio >= 0.75;
  };

  // 移除 isFist 判断

  // 物理记录状态
  const isRecording = useRef(false);
  const recordBuffer = useRef<PhysicsDataRecord[]>([]);
  const recordStartTime = useRef(0);
  const lastRecordTime = useRef(0);
  const lastPhi = useRef(0);
  const lastSamplePhi = useRef(0);
  const isInitialized = useRef(false);

  // 视觉感应电流的状态（用于平滑和通知父组件重绘）
  const visualCurrentRef = useRef(0);
  const lastReportedVisualCurrent = useRef(0);

  useFrame((_, delta) => {
    const hands = handsDataRef.current;
    if (!hands || hands.length === 0) return;

    let leftHand: HandData | undefined;
    let rightHand: HandData | undefined;
    
    hands.forEach(h => {
      if (h.handedness === 'Left') leftHand = h;
      if (h.handedness === 'Right') rightHand = h;
    });

    let isPinchingLeft = false;
    let isPinchingRight = false;

    if (leftHand && leftHand.landmarks.length >= 21) {
      isPinchingLeft = isPinching(leftHand.landmarks);
    }
    
    if (rightHand && rightHand.landmarks.length >= 21) {
      isPinchingRight = isPinching(rightHand.landmarks);
    }

    const rawIsDoublePinching = isPinchingLeft && isPinchingRight;
    
    let isDoublePinching = rawIsDoublePinching;
    if (rawIsDoublePinching) {
      doublePinchLossStartTime.current = -1;
    } else if (pinchStartHandsDist.current !== -1) {
      if (doublePinchLossStartTime.current === -1) {
        doublePinchLossStartTime.current = performance.now();
      }
      if (performance.now() - doublePinchLossStartTime.current < 300) {
        isDoublePinching = true; // 防抖期内维持缩放状态
      }
    }

    const getFlux = (magnetX: number, solenoidX: number) => {
      const t = temperature ?? 20;
      const str = magnetStrength ?? 1.0;
      const sCurrent = solenoidCurrent ?? 0;
      
      const tempFactor = t > 20 
        ? Math.max(0, 1 - Math.pow((t - 20) / 100, 2)) 
        : 1.0;
      const effectiveB0 = baseMagneticField * str * tempFactor;
      
      const relativeX = (magnetX - solenoidX) * metersPerUnit;
      const R = radius * metersPerUnit;
      const Area = Math.PI * Math.pow(R, 2);
      
      // 偶极子穿过线圈的磁通量模型 (高斯分布/钟形曲线，自动处理楞次定律的正负反转)
      const phiMag = effectiveB0 * Area * Math.pow(R, 3) / Math.pow(relativeX * relativeX + R * R, 1.5);
      
      // 外加电流产生的磁通量
      const phiExt = sCurrent * 0.005;
      
      return phiMag + phiExt;
    };

    // 1. 始终计算当前的磁通量和瞬时电流（不受录制状态限制）
    let currentPhi = 0;
    if (magnetRef.current && solenoidRef.current) {
      currentPhi = getFlux(magnetRef.current.position.x, solenoidRef.current.position.x);
      if (!isInitialized.current) {
        lastPhi.current = currentPhi;
        isInitialized.current = true;
      }
    }
    
    let instCurrent = 0;
    let instEmf = 0;
    if (delta > 0 && magnetRef.current && solenoidRef.current) {
      const instDPhi = currentPhi - lastPhi.current;
      instEmf = -coils * (instDPhi / delta);
      instCurrent = instEmf / wireResistance;
      lastPhi.current = currentPhi;
    }

    // 2. 对视觉电流进行平滑（低通滤波），产生弹性和惯性感，符合楞次定律的“阻碍”特性
    visualCurrentRef.current = THREE.MathUtils.lerp(visualCurrentRef.current, instCurrent, 0.15);
    
    // 如果电流极其微弱，让它归零以彻底停止重绘
    if (Math.abs(instCurrent) < 0.01 && Math.abs(visualCurrentRef.current) < 0.05) {
      visualCurrentRef.current = 0;
    }

    // 只有当平滑后的视觉电流变化显著时，或者需要归零时，才通知父组件更新，避免无意义的重绘
    if (
      Math.abs(visualCurrentRef.current - lastReportedVisualCurrent.current) > 0.05 || 
      (Math.abs(visualCurrentRef.current) === 0 && Math.abs(lastReportedVisualCurrent.current) > 0)
    ) {
      lastReportedVisualCurrent.current = visualCurrentRef.current;
      if (onVisualCurrentChange) onVisualCurrentChange(visualCurrentRef.current);
    }

    // 更新物理状态引用
    if (inducedCurrentRef) {
      inducedCurrentRef.current = instCurrent;
    }

    // 3. 处理数据记录逻辑
    if (isRecordingForce) {
      if (!isRecording.current) {
        // 开始录制
        isRecording.current = true;
        recordBuffer.current = [];
        recordStartTime.current = performance.now();
        lastRecordTime.current = 0;
        if (magnetRef.current && solenoidRef.current) {
           lastSamplePhi.current = currentPhi;
        }
      } else {
        // 持续录制
        if (magnetRef.current && solenoidRef.current && delta > 0) {
          const elapsed = (performance.now() - recordStartTime.current) / 1000;
          // 按 0.1s 采样用于数据表格
          if (elapsed - lastRecordTime.current >= 0.1 || recordBuffer.current.length === 0) {
            const dt = elapsed - lastRecordTime.current || 0.1;
            const sampleDPhi = currentPhi - lastSamplePhi.current;
            const sampleEmf = -coils * (sampleDPhi / dt);
            const sampleCurrent = sampleEmf / wireResistance;
            const relativeX = (magnetRef.current.position.x - solenoidRef.current.position.x) * metersPerUnit;
            
            recordBuffer.current.push({
              time: elapsed,
              distance: relativeX,
              flux: currentPhi,
              emf: sampleEmf,
              current: sampleCurrent,
              dPhi: sampleDPhi,
              dt: dt
            });
            
            lastRecordTime.current = elapsed;
            lastSamplePhi.current = currentPhi;
          }
        }
      }
    } else {
      if (isRecording.current) {
        // 结束录制，返回所有按 0.1s 采样的数据
        isRecording.current = false;
        if (recordBuffer.current.length > 0 && setRecordedData) {
          // 直接将缓冲区的全部数据传给展示面板
          setRecordedData([...recordBuffer.current]);
        }
      }
    }

    // 更新上一帧磁通量
    if (magnetRef.current && solenoidRef.current) {
      lastPhi.current = currentPhi;
    }

    // === 缩放控制（双手同时捏合） ===
    if (isDoublePinching && leftHand && rightHand) {
      const pL = leftHand.landmarks[9];
      const pR = rightHand.landmarks[9];
      const handsDist = Math.hypot(pL.x - pR.x, pL.y - pR.y);

      if (pinchStartHandsDist.current === -1) {
        pinchStartHandsDist.current = handsDist;
        pinchStartRadius.current = cameraRadius.current;
      } else {
        const sensitivity = zoomSensitivity; 
        const distRatio = handsDist / pinchStartHandsDist.current;
        const zoomFactor = 1.0 + (distRatio - 1.0) * sensitivity;

        if (zoomFactor > 0.1) {
           const targetRadius = pinchStartRadius.current / zoomFactor;
           cameraRadius.current = Math.max(2, Math.min(40, targetRadius)); 
        }
      }
    } else {
      pinchStartHandsDist.current = -1;
    }

    // === 左手：控制视角姿态 (旋转) ===
    // 只有在没有握拳且没有双手捏合时，才允许单指捏合旋转视角
    if (leftHand && leftHand.landmarks.length >= 21 && !isDoublePinching && !isRecordingForce) {
      const palm = leftHand.landmarks[9];
      
      if (isPinchingLeft) {
        if (leftPinchStartX.current === -1) {
          leftPinchStartX.current = palm.x;
          leftPinchStartY.current = palm.y;
          startYaw.current = currentYaw.current;
          startPitch.current = currentPitch.current;
        } else {
          const deltaX = palm.x - leftPinchStartX.current;
          const deltaY = palm.y - leftPinchStartY.current;

          currentYaw.current = startYaw.current - deltaX * Math.PI * 3.0 * leftRotateSensitivity; 
          currentPitch.current = startPitch.current + deltaY * Math.PI * 2.0 * leftRotateSensitivity;

          currentPitch.current = Math.min(0, Math.max(-Math.PI / 2, currentPitch.current));
        }
      } else {
        leftPinchStartX.current = -1;
      }
    }

    targetCameraPos.current.x = cameraRadius.current * Math.sin(currentYaw.current) * Math.cos(currentPitch.current);
    targetCameraPos.current.y = cameraRadius.current * Math.sin(-currentPitch.current);
    targetCameraPos.current.z = cameraRadius.current * Math.cos(currentYaw.current) * Math.cos(currentPitch.current);

    // === 右手：控制磁铁位移 ===
    let rawIsPinchingRight = false;
    if (rightHand && rightHand.landmarks.length >= 21) {
      rawIsPinchingRight = isPinching(rightHand.landmarks);
    }
    
    let isPinchingRightForDrag = rawIsPinchingRight;
    if (rawIsPinchingRight) {
      rightPinchLossStartTime.current = -1;
    } else if (rightPinchStartX.current !== -1) {
      if (rightPinchLossStartTime.current === -1) {
        rightPinchLossStartTime.current = performance.now();
      }
      if (performance.now() - rightPinchLossStartTime.current < 300) {
        isPinchingRightForDrag = true;
      }
    }

    if (rightHand && rightHand.landmarks.length >= 21 && !isDoublePinching && mouseDragTarget.current === 'none') {
      if (isPinchingRightForDrag && magnetRef.current) {
        const palm = rightHand.landmarks[0];
        
        if (rightPinchStartX.current === -1) {
          rightPinchStartX.current = palm.x;
          // 防止重新捏合时发生抖动回弹，优先使用当前正在 lerp 的目标值
          rightPinchStartMagnetX.current = targetMagnetX.current !== null ? targetMagnetX.current : magnetRef.current.position.x;
          targetMagnetX.current = rightPinchStartMagnetX.current;
        } else {
          const deltaX = palm.x - rightPinchStartX.current;
          
          const targetX = rightPinchStartMagnetX.current - deltaX * rightDragSensitivity; 
          
          targetMagnetX.current = Math.max(-15, Math.min(15, targetX));
        }
      } else {
        rightPinchStartX.current = -1;
        rightPinchLossStartTime.current = -1;
      }
    } else {
      rightPinchStartX.current = -1;
      rightPinchLossStartTime.current = -1;
    }

    // 平滑插值磁铁位置
    if (magnetRef.current && targetMagnetX.current !== null) {
      magnetRef.current.position.x = THREE.MathUtils.lerp(
        magnetRef.current.position.x, 
        targetMagnetX.current, 
        0.15
      );
      if (Math.abs(magnetRef.current.position.x - lastReportedMagnetX.current) > 0.01) {
        lastReportedMagnetX.current = magnetRef.current.position.x;
        onMagnetMove(magnetRef.current.position.x);
      }
    }

    // 处理磁铁边界发光反馈
    if (magnetRef.current) {
      const mx = magnetRef.current.position.x;
      if (leftLightRef?.current) {
        if (mx <= -14.9) {
          leftLightRef.current.intensity = THREE.MathUtils.lerp(leftLightRef.current.intensity, 15, 0.2);
        } else {
          leftLightRef.current.intensity = THREE.MathUtils.lerp(leftLightRef.current.intensity, 0, 0.1);
        }
      }
      if (rightLightRef?.current) {
        if (mx >= 14.9) {
          rightLightRef.current.intensity = THREE.MathUtils.lerp(rightLightRef.current.intensity, 15, 0.2);
        } else {
          rightLightRef.current.intensity = THREE.MathUtils.lerp(rightLightRef.current.intensity, 0, 0.1);
        }
      }
    }

    // 平滑插值相机位置
    currentCameraPos.current.lerp(targetCameraPos.current, 0.1);
    camera.position.copy(currentCameraPos.current);
    // 相机始终看向场景中心，产生轨道旋转的效果
    camera.lookAt(0, 0, 0);
  });

  return null;
};
