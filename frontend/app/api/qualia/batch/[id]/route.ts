/**
 * ============================================================================
 * QUALIA BATCH OPERATIONS API
 * ============================================================================
 * 
 * Operations on individual wire batches:
 * - GET: Get batch details
 * - POST: Execute actions (approve, reject, execute, download-reconciliation)
 * - DELETE: Cancel/delete batch
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeBridgePayouts, validateBatch } from '@/lib/qualia-executor';
import { 
  generateQualiaPositivePayFile,
  generateBankReconciliationFile,
  generateAllReconciliationFiles,
} from '@/lib/qualia-reconciliation';
import { ParsedPayoutItem } from '@/lib/qualia-parser';

// ============================================================================
// GET - Get Batch Details
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const batch = await prisma.wireBatch.findFirst({
      where: {
        OR: [
          { id },
          { batchId: id },
        ],
      },
      include: {
        escrow: {
          select: {
            id: true,
            escrowId: true,
            propertyAddress: true,
            purchasePrice: true,
            status: true,
          },
        },
      },
    });
    
    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      batch: {
        ...batch,
        totalAmount: Number(batch.totalAmount),
        wireTotal: Number(batch.wireTotal),
        rtpTotal: Number(batch.rtpTotal),
      },
    });
    
  } catch (error) {
    console.error('[Qualia Batch API] Get error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Execute Batch Actions
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, checkerWallet, checkerName, notes, bridgeWalletId, sourceCurrency } = body;
    
    // Fetch the batch
    const batch = await prisma.wireBatch.findFirst({
      where: {
        OR: [
          { id },
          { batchId: id },
        ],
      },
    });
    
    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }
    
    switch (action) {
      // ════════════════════════════════════════════════════════════════════
      // APPROVE - Checker approves the batch
      // ════════════════════════════════════════════════════════════════════
      case 'approve': {
        if (!checkerWallet) {
          return NextResponse.json(
            { error: 'Checker wallet is required for approval' },
            { status: 400 }
          );
        }
        
        // Dual control: Checker cannot be the same as Maker
        if (checkerWallet.toLowerCase() === batch.makerWallet.toLowerCase()) {
          return NextResponse.json(
            { error: 'Dual control violation: Approver cannot be the same as uploader' },
            { status: 400 }
          );
        }
        
        if (batch.status !== 'UPLOADED' && batch.status !== 'PENDING') {
          return NextResponse.json(
            { error: `Cannot approve batch in ${batch.status} status` },
            { status: 400 }
          );
        }
        
        const approvedBatch = await prisma.wireBatch.update({
          where: { id: batch.id },
          data: {
            status: 'APPROVED',
            checkerWallet,
            checkerName: checkerName || undefined,
            reviewedAt: new Date(),
            reviewNotes: notes || 'Approved',
          },
        });
        
        return NextResponse.json({
          success: true,
          batch: {
            ...approvedBatch,
            totalAmount: Number(approvedBatch.totalAmount),
          },
          message: `Batch ${batch.batchId} approved by ${checkerName || checkerWallet}`,
        });
      }
      
      // ════════════════════════════════════════════════════════════════════
      // REJECT - Checker rejects the batch
      // ════════════════════════════════════════════════════════════════════
      case 'reject': {
        if (!checkerWallet) {
          return NextResponse.json(
            { error: 'Checker wallet is required for rejection' },
            { status: 400 }
          );
        }
        
        if (batch.status !== 'UPLOADED' && batch.status !== 'PENDING') {
          return NextResponse.json(
            { error: `Cannot reject batch in ${batch.status} status` },
            { status: 400 }
          );
        }
        
        const rejectedBatch = await prisma.wireBatch.update({
          where: { id: batch.id },
          data: {
            status: 'REJECTED',
            checkerWallet,
            checkerName: checkerName || undefined,
            reviewedAt: new Date(),
            reviewNotes: notes || 'Rejected',
          },
        });
        
        return NextResponse.json({
          success: true,
          batch: {
            ...rejectedBatch,
            totalAmount: Number(rejectedBatch.totalAmount),
          },
          message: `Batch ${batch.batchId} rejected: ${notes || 'No reason provided'}`,
        });
      }
      
      // ════════════════════════════════════════════════════════════════════
      // EXECUTE - Process payouts via Bridge.xyz
      // ════════════════════════════════════════════════════════════════════
      case 'execute': {
        // Allow execution from UPLOADED or APPROVED status
        // (Dual control is handled at the escrow level, not batch level)
        if (!['UPLOADED', 'APPROVED'].includes(batch.status)) {
          return NextResponse.json(
            { error: `Cannot execute batch in ${batch.status} status.` },
            { status: 400 }
          );
        }
        
        // Get bridgeWalletId from: request body > batch > linked escrow
        let sourceWalletId = bridgeWalletId || batch.bridgeWalletId;
        
        // If not set, try to get it from the linked escrow
        if (!sourceWalletId && batch.escrowId) {
          const linkedEscrow = await prisma.escrow.findUnique({
            where: { id: batch.escrowId },
            select: { bridgeWalletId: true, yieldEnabled: true },
          });
          
          if (linkedEscrow?.bridgeWalletId) {
            sourceWalletId = linkedEscrow.bridgeWalletId;
          }
        }
        
        if (!sourceWalletId) {
          return NextResponse.json(
            { error: 'Bridge wallet ID is required for execution. Please ensure the escrow has been properly set up with Bridge.xyz.' },
            { status: 400 }
          );
        }
        
        // Update status to PROCESSING
        await prisma.wireBatch.update({
          where: { id: batch.id },
          data: {
            status: 'PROCESSING',
            executedAt: new Date(),
            bridgeWalletId: sourceWalletId,
            sourceCurrency: sourceCurrency || batch.sourceCurrency || 'usdb',
          },
        });
        
        // Get parsed items
        const parsedItems = batch.parsedItems as unknown as ParsedPayoutItem[];
        
        if (!parsedItems || parsedItems.length === 0) {
          await prisma.wireBatch.update({
            where: { id: batch.id },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
            },
          });
          
          return NextResponse.json(
            { error: 'No items to process in batch' },
            { status: 400 }
          );
        }
        
        // Execute payouts
        const result = await executeBridgePayouts({
          batchId: batch.batchId,
          sourceWalletId,
          sourceCurrency: (sourceCurrency || batch.sourceCurrency || 'usdb') as 'usdb' | 'usdc',
          items: parsedItems,
          dryRun: false,
        });
        
        // Determine final status
        let finalStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED';
        if (result.totalFailed === 0 && result.totalSkipped === 0) {
          finalStatus = 'COMPLETED';
        } else if (result.totalSuccess > 0) {
          finalStatus = 'PARTIAL';
        } else {
          finalStatus = 'FAILED';
        }
        
        // Update batch with results
        const executedBatch = await prisma.wireBatch.update({
          where: { id: batch.id },
          data: {
            status: finalStatus,
            successCount: result.totalSuccess,
            failedCount: result.totalFailed,
            skippedCount: result.totalSkipped,
            executionResults: result.results as any,
            completedAt: new Date(),
          },
        });
        
        return NextResponse.json({
          success: result.success,
          batch: {
            ...executedBatch,
            totalAmount: Number(executedBatch.totalAmount),
          },
          result: {
            ...result,
            // Don't send full results in response (can be large)
            results: result.results.map(r => ({
              lineNumber: r.lineNumber,
              payeeName: r.payeeName,
              amount: r.amount,
              status: r.status,
              paymentRail: r.paymentRail,
              errorMessage: r.errorMessage,
            })),
          },
          message: `Batch ${batch.batchId} executed: ${result.totalSuccess} success, ${result.totalFailed} failed, ${result.totalSkipped} skipped`,
        });
      }
      
      // ════════════════════════════════════════════════════════════════════
      // DOWNLOAD-RECONCILIATION - Generate and return reconciliation file
      // ════════════════════════════════════════════════════════════════════
      case 'download-reconciliation': {
        const format = body.format || 'qualia-positive-pay';
        
        if (!['COMPLETED', 'PARTIAL', 'FAILED'].includes(batch.status)) {
          return NextResponse.json(
            { error: 'Reconciliation file only available for completed or partially completed batches' },
            { status: 400 }
          );
        }
        
        const results = batch.executionResults as any[];
        
        if (!results || results.length === 0) {
          return NextResponse.json(
            { error: 'No execution results available' },
            { status: 400 }
          );
        }
        
        let file;
        
        switch (format) {
          case 'qualia-positive-pay':
            file = generateQualiaPositivePayFile(results, batch.batchId);
            break;
          case 'bank-reconciliation':
            file = generateBankReconciliationFile(results, batch.batchId);
            break;
          case 'all':
            // Return all files as JSON (frontend can download each)
            const allFiles = generateAllReconciliationFiles(results, batch.batchId, {
              sourceWalletId: batch.bridgeWalletId || undefined,
              originalFileName: batch.fileName,
            });
            
            await prisma.wireBatch.update({
              where: { id: batch.id },
              data: {
                reconciliationGenerated: true,
                reconciliationDownloadedAt: new Date(),
              },
            });
            
            return NextResponse.json({
              success: true,
              files: allFiles,
            });
          default:
            file = generateQualiaPositivePayFile(results, batch.batchId);
        }
        
        // Update batch
        await prisma.wireBatch.update({
          where: { id: batch.id },
          data: {
            reconciliationGenerated: true,
            reconciliationDownloadedAt: new Date(),
          },
        });
        
        // Return as downloadable file
        return new NextResponse(file.content, {
          status: 200,
          headers: {
            'Content-Type': file.mimeType,
            'Content-Disposition': `attachment; filename="${file.fileName}"`,
          },
        });
      }
      
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('[Qualia Batch API] Action error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to execute action',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Cancel/Delete Batch
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
    
    const batch = await prisma.wireBatch.findFirst({
      where: {
        OR: [
          { id },
          { batchId: id },
        ],
      },
    });
    
    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }
    
    // Only allow cancellation of non-executed batches
    if (['PROCESSING', 'COMPLETED', 'PARTIAL'].includes(batch.status)) {
      return NextResponse.json(
        { error: `Cannot cancel batch in ${batch.status} status` },
        { status: 400 }
      );
    }
    
    // Only maker can cancel their own batch
    if (wallet && wallet.toLowerCase() !== batch.makerWallet.toLowerCase()) {
      return NextResponse.json(
        { error: 'Only the uploader can cancel this batch' },
        { status: 403 }
      );
    }
    
    await prisma.wireBatch.update({
      where: { id: batch.id },
      data: {
        status: 'CANCELLED',
        reviewNotes: 'Cancelled by uploader',
      },
    });
    
    return NextResponse.json({
      success: true,
      message: `Batch ${batch.batchId} has been cancelled`,
    });
    
  } catch (error) {
    console.error('[Qualia Batch API] Delete error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel batch' },
      { status: 500 }
    );
  }
}
