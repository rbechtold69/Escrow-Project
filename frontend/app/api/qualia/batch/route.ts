/**
 * ============================================================================
 * QUALIA BATCH API - File Bridge Endpoints
 * ============================================================================
 * 
 * Handles:
 * - POST: Upload and parse a wire batch file
 * - GET: List all wire batches
 * 
 * See /api/qualia/batch/[id]/route.ts for individual batch operations
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';
import { parseQualiaExport, validateRoutingNumber } from '@/lib/qualia-parser';
import { validateBatch } from '@/lib/qualia-executor';
import crypto from 'crypto';

// ============================================================================
// POST - Upload and Parse Wire Batch File
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const makerWallet = formData.get('makerWallet') as string;
    const makerName = formData.get('makerName') as string | null;
    const escrowId = formData.get('escrowId') as string | null;
    const bridgeWalletId = formData.get('bridgeWalletId') as string | null;
    const sourceCurrency = formData.get('sourceCurrency') as string | null;
    
    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }
    
    if (!makerWallet) {
      return NextResponse.json(
        { error: 'Maker wallet address is required' },
        { status: 400 }
      );
    }
    
    // Read file contents
    const fileContent = await file.text();
    const fileName = file.name;
    const fileSize = file.size;
    
    console.log('[Qualia Batch API] File received:', { fileName, fileSize, contentLength: fileContent.length });
    console.log('[Qualia Batch API] First 200 chars:', fileContent.substring(0, 200));
    
    // Calculate file hash for integrity
    const fileHash = crypto
      .createHash('sha256')
      .update(fileContent)
      .digest('hex');
    
    // Parse the file
    const parseResult = parseQualiaExport(fileContent, fileName);
    
    console.log('[Qualia Batch API] Parse result:', { 
      success: parseResult.success, 
      itemCount: parseResult.items.length,
      fileType: parseResult.fileType,
      errors: parseResult.errors 
    });
    
    if (!parseResult.success && parseResult.items.length === 0) {
      return NextResponse.json(
        { 
          error: 'Failed to parse file',
          details: parseResult.errors,
          fileType: parseResult.fileType,
          debug: {
            fileName,
            fileSize,
            contentPreview: fileContent.substring(0, 300),
          }
        },
        { status: 400 }
      );
    }
    
    // Validate the batch
    const validation = validateBatch(parseResult.items);
    
    // Generate batch ID
    const batchNumber = Date.now().toString().slice(-8);
    const batchId = `WB-${new Date().getFullYear()}-${batchNumber}`;
    
    // Create the wire batch record
    const wireBatch = await prisma.wireBatch.create({
      data: {
        batchId,
        fileName,
        fileType: parseResult.fileType,
        fileSize,
        fileHash,
        status: 'UPLOADED',
        totalItems: parseResult.totalItems,
        totalAmount: parseResult.totalAmount,
        wireCount: validation.summary.wireCount,
        wireTotal: validation.summary.wireTotal,
        rtpCount: validation.summary.rtpCount,
        rtpTotal: validation.summary.rtpTotal,
        makerWallet,
        makerName: makerName || undefined,
        bridgeWalletId: bridgeWalletId || undefined,
        sourceCurrency: sourceCurrency || 'usdb',
        parsedItems: parseResult.items as any,
        escrowId: escrowId || undefined,
      },
    });
    
    return NextResponse.json({
      success: true,
      batch: {
        id: wireBatch.id,
        batchId: wireBatch.batchId,
        status: wireBatch.status,
        fileName: wireBatch.fileName,
        fileType: wireBatch.fileType,
        totalItems: wireBatch.totalItems,
        totalAmount: Number(wireBatch.totalAmount),
        summary: validation.summary,
        parseErrors: parseResult.errors,
        validationErrors: validation.errors,
        uploadedAt: wireBatch.uploadedAt,
      },
      message: `Batch ${batchId} uploaded successfully. ${parseResult.totalItems} items totaling $${parseResult.totalAmount.toLocaleString()}`,
    });
    
  } catch (error) {
    console.error('[Qualia Batch API] Upload error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process batch file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET - List All Wire Batches
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const makerWallet = searchParams.get('makerWallet');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // Build filter
    const where: any = {};
    
    if (status) {
      where.status = status;
    }
    
    if (makerWallet) {
      where.makerWallet = makerWallet;
    }
    
    // Fetch batches
    const [batches, total] = await Promise.all([
      prisma.wireBatch.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          batchId: true,
          status: true,
          fileName: true,
          fileType: true,
          totalItems: true,
          totalAmount: true,
          wireCount: true,
          wireTotal: true,
          rtpCount: true,
          rtpTotal: true,
          successCount: true,
          failedCount: true,
          skippedCount: true,
          makerWallet: true,
          makerName: true,
          checkerWallet: true,
          checkerName: true,
          uploadedAt: true,
          reviewedAt: true,
          executedAt: true,
          completedAt: true,
          reconciliationGenerated: true,
          escrowId: true,
        },
      }),
      prisma.wireBatch.count({ where }),
    ]);
    
    // Format amounts
    const formattedBatches = batches.map(batch => ({
      ...batch,
      totalAmount: Number(batch.totalAmount),
      wireTotal: Number(batch.wireTotal),
      rtpTotal: Number(batch.rtpTotal),
    }));
    
    return NextResponse.json({
      batches: formattedBatches,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + batches.length < total,
      },
    });
    
  } catch (error) {
    console.error('[Qualia Batch API] List error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batches' },
      { status: 500 }
    );
  }
}
