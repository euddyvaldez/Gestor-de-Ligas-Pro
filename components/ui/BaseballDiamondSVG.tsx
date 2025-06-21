
import React from 'react';
import { PlayerOnBase } from '../../types'; // Import PlayerOnBase

interface BaseballDiamondSVGProps {
  bases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null]; // [1B, 2B, 3B]
  className?: string;
  onBaseClick?: (baseIndex: 0 | 1 | 2) => void; // Optional: 0 for 1B, 1 for 2B, 2 for 3B
  disabled?: boolean; // To disable clicks if needed
}

export const BaseballDiamondSVG: React.FC<BaseballDiamondSVGProps> = ({
    bases,
    className = '',
    onBaseClick,
    disabled = false
}) => {
  const occupiedBaseColor = "#ffc107"; // Corresponds to --color-warning
  const emptyBaseColor = "white";
  const baseStrokeColor = "black";
  const baseStrokeWidth = "3";
  const baseLineWidth = "12";
  const innerBaseLineWidth = "6";
  const dirtColor = "#D2B48C";

  // Label specific styles
  const labelBackgroundColor = "#E9ECEF"; // Light gray
  const labelTextColor = "#212529";     // Dark text
  const labelBorderColor = "#ADB5BD";   // Medium gray for subtle border
  const labelTextFontSize = "13px";
  const labelFontWeight = "500";
  const labelPaddingX = 8; // Horizontal padding inside the label rect
  const labelPaddingY = 4; // Vertical padding inside the label rect
  const labelBorderRadius = 3;
  const labelRectHeight = parseFloat(labelTextFontSize) + 2 * labelPaddingY;
  const labelRectWidth = 90; // Fixed width for the background rectangle for names

  const handleBaseInteraction = (baseIndex: 0 | 1 | 2) => {
    if (onBaseClick && !disabled) {
      onBaseClick(baseIndex);
    }
  };

  const baseCoords = {
    first: { x: 300, y: 200 }, // 1B
    second: { x: 200, y: 100 }, // 2B
    third: { x: 100, y: 200 }, // 3B
    home: { x: 200, y: 300 } // Home Plate
  };
  const baseRectSize = 55;

  const truncateName = (name: string, maxLength: number = 10): string => {
    if (name.length > maxLength) {
      return name.substring(0, maxLength - 1) + '…';
    }
    return name;
  };

  const renderPlayerLabel = (player: PlayerOnBase | null, labelCenterX: number, labelCenterY: number) => {
    if (!player) return null;

    const displayName = truncateName(player.nombreJugador);

    return (
      <g>
        <rect
          x={labelCenterX - labelRectWidth / 2}
          y={labelCenterY - labelRectHeight / 2}
          width={labelRectWidth}
          height={labelRectHeight}
          fill={labelBackgroundColor}
          stroke={labelBorderColor}
          strokeWidth="0.5"
          rx={labelBorderRadius}
          ry={labelBorderRadius}
        />
        <text
          x={labelCenterX}
          y={labelCenterY}
          fontSize={labelTextFontSize}
          fontWeight={labelFontWeight}
          fill={labelTextColor}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {displayName}
        </text>
      </g>
    );
  };
  
  // Calculate label positions
  const firstBaseLabelPos = {
    x: baseCoords.first.x + baseRectSize * 0.5 + labelRectWidth * 0.1, // Adjusted for aesthetics
    y: baseCoords.first.y + baseRectSize * 0.5 + labelRectHeight * 0.1, // Adjusted
  };
  const secondBaseLabelPos = {
    x: baseCoords.second.x,
    y: baseCoords.second.y - baseRectSize * 0.5 - labelRectHeight / 2 - 8, // Positioned above, 8px gap
  };
  const thirdBaseLabelPos = {
    x: baseCoords.third.x - baseRectSize * 0.5 - labelRectWidth * 0.1, // Adjusted
    y: baseCoords.third.y + baseRectSize * 0.5 + labelRectHeight * 0.1, // Adjusted
  };


  return (
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Infield Grass/Dirt */}
      <polygon points="200,310 310,200 200,90 90,200" fill="#a1c969" />

      {/* Base lines (black border) */}
      <line x1="200" y1="300" x2="300" y2="200" stroke={baseStrokeColor} strokeWidth={baseLineWidth}/>
      <line x1="300" y1="200" x2="200" y2="100" stroke={baseStrokeColor} strokeWidth={baseLineWidth}/>
      <line x1="200" y1="100" x2="100" y2="200" stroke={baseStrokeColor} strokeWidth={baseLineWidth}/>
      <line x1="100" y1="200" x2="200" y2="300" stroke={baseStrokeColor} strokeWidth={baseLineWidth}/>

      {/* Inner white lines */}
      <line x1="200" y1="300" x2="300" y2="200" stroke="white" strokeWidth={innerBaseLineWidth}/>
      <line x1="300" y1="200" x2="200" y2="100" stroke="white" strokeWidth={innerBaseLineWidth}/>
      <line x1="200" y1="100" x2="100" y2="200" stroke="white" strokeWidth={innerBaseLineWidth}/>
      <line x1="100" y1="200" x2="200" y2="300" stroke="white" strokeWidth={innerBaseLineWidth}/>

      {/* First Base (1B) - bases[0] */}
      <g onClick={() => handleBaseInteraction(0)} style={{ cursor: disabled ? 'default' : 'pointer' }} role="button" aria-label="Primera base" aria-pressed={!!bases[0]}>
        <rect
          x={baseCoords.first.x - baseRectSize / 2} y={baseCoords.first.y - baseRectSize / 2}
          width={baseRectSize} height={baseRectSize}
          fill={bases[0] ? occupiedBaseColor : emptyBaseColor}
          stroke={baseStrokeColor} strokeWidth={baseStrokeWidth}
          transform={`rotate(45 ${baseCoords.first.x} ${baseCoords.first.y})`}
        />
      </g>
      {renderPlayerLabel(bases[0], firstBaseLabelPos.x, firstBaseLabelPos.y)}


      {/* Second Base (2B) - bases[1] */}
      <g onClick={() => handleBaseInteraction(1)} style={{ cursor: disabled ? 'default' : 'pointer' }} role="button" aria-label="Segunda base" aria-pressed={!!bases[1]}>
        <rect
          x={baseCoords.second.x - baseRectSize / 2} y={baseCoords.second.y - baseRectSize / 2}
          width={baseRectSize} height={baseRectSize}
          fill={bases[1] ? occupiedBaseColor : emptyBaseColor}
          stroke={baseStrokeColor} strokeWidth={baseStrokeWidth}
          transform={`rotate(45 ${baseCoords.second.x} ${baseCoords.second.y})`}
        />
      </g>
      {renderPlayerLabel(bases[1], secondBaseLabelPos.x, secondBaseLabelPos.y)}

      {/* Third Base (3B) - bases[2] */}
      <g onClick={() => handleBaseInteraction(2)} style={{ cursor: disabled ? 'default' : 'pointer' }} role="button" aria-label="Tercera base" aria-pressed={!!bases[2]}>
        <rect
          x={baseCoords.third.x - baseRectSize / 2} y={baseCoords.third.y - baseRectSize / 2}
          width={baseRectSize} height={baseRectSize}
          fill={bases[2] ? occupiedBaseColor : emptyBaseColor}
          stroke={baseStrokeColor} strokeWidth={baseStrokeWidth}
          transform={`rotate(45 ${baseCoords.third.x} ${baseCoords.third.y})`}
        />
      </g>
      {renderPlayerLabel(bases[2], thirdBaseLabelPos.x, thirdBaseLabelPos.y)}

      {/* Pitcher's Mound */}
      <circle cx="200" cy="200" r="25" fill={dirtColor}/>
      <rect x="190" y="196" width="20" height="8" fill="white" stroke={baseStrokeColor} strokeWidth="1"/>

      {/* Home Plate */}
      <g>
        <polygon
          points="190,315 210,315 210,300 200,290 190,300"
          fill="white" stroke={baseStrokeColor} strokeWidth={baseStrokeWidth}
        />
      </g>
    </svg>
  );
};
