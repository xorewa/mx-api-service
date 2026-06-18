import { Controller, DefaultValuePipe, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ParseAddressPipe, ParseIntPipe, ParseTokenPipe } from '@multiversx/sdk-nestjs-common';
import { QueryPagination } from 'src/common/entities/query.pagination';
import { DrwaTokenPolicy, DrwaTokenPolicyHistoryEntry } from './entities/drwa.token.policy';
import { DrwaHolderCompliance } from './entities/drwa.holder.compliance';
import { DrwaDenial } from './entities/drwa.denial';
import { DrwaAttestation } from './entities/drwa.attestation';
import { DrwaDenialFilter } from './entities/drwa.denial.filter';
import { DrwaService } from './drwa.service';
import { DrwaAssetRecord } from './entities/drwa.asset.record';
import { DrwaIdentityRecord } from './entities/drwa.identity.record';

@Controller()
@ApiTags('drwa')
export class DrwaController {
  constructor(
    private readonly drwaService: DrwaService,
  ) { }

  @Get('/drwa/tokens/:identifier')
  @ApiOperation({ summary: 'DRWA token policy', description: 'Returns the DRWA compliance policy summary for a specific token' })
  @ApiOkResponse({ type: DrwaTokenPolicy })
  @ApiNotFoundResponse({ description: 'Token not found or not DRWA regulated' })
  async getDrwaTokenPolicy(
    @Param('identifier', ParseTokenPipe) identifier: string,
  ): Promise<DrwaTokenPolicy> {
    const result = await this.drwaService.getDrwaTokenPolicy(identifier);
    if (!result) {
      throw new NotFoundException('Token not found or not DRWA regulated');
    }

    return result;
  }

  @Get('/drwa/accounts/:address/tokens/:identifier')
  @ApiOperation({ summary: 'DRWA holder compliance', description: 'Returns the DRWA compliance state for a specific address and token' })
  @ApiOkResponse({ type: DrwaHolderCompliance })
  @ApiNotFoundResponse({ description: 'Holder compliance record not found' })
  async getDrwaHolderCompliance(
    @Param('address', ParseAddressPipe) address: string,
    @Param('identifier', ParseTokenPipe) identifier: string,
  ): Promise<DrwaHolderCompliance> {
    const result = await this.drwaService.getDrwaHolderCompliance(address, identifier);
    if (!result) {
      throw new NotFoundException('Holder compliance record not found');
    }

    return result;
  }

  @Get('/drwa/token-policies/:identifier')
  @ApiOperation({ summary: 'DRWA token policy compatibility route', description: 'Returns the canonical DRWA token policy for platform clients' })
  @ApiOkResponse({ type: DrwaTokenPolicy })
  @ApiNotFoundResponse({ description: 'Token not found or not DRWA regulated' })
  getDrwaTokenPolicyCompat(
    @Param('identifier', ParseTokenPipe) identifier: string,
  ): Promise<DrwaTokenPolicy> {
    return this.getDrwaTokenPolicy(identifier);
  }

  @Get('/drwa/token-policies/:identifier/history')
  @ApiOperation({ summary: 'DRWA token policy history compatibility route', description: 'Returns DRWA token policy history for platform clients' })
  @ApiOkResponse({ type: [DrwaTokenPolicyHistoryEntry] })
  async getDrwaTokenPolicyHistoryCompat(
    @Param('identifier', ParseTokenPipe) identifier: string,
  ): Promise<DrwaTokenPolicyHistoryEntry[]> {
    const result = await this.drwaService.getDrwaTokenPolicy(identifier);
    if (!result) {
      throw new NotFoundException('Token not found or not DRWA regulated');
    }

    return result.history ?? [];
  }

  @Get('/drwa/holder-compliance/:address')
  @ApiOperation({ summary: 'DRWA holder compliance compatibility route', description: 'Returns DRWA compliance state by address, optionally filtered by tokenId' })
  @ApiOkResponse({ type: DrwaHolderCompliance })
  @ApiNotFoundResponse({ description: 'Holder compliance record not found' })
  async getDrwaHolderComplianceCompat(
    @Param('address', ParseAddressPipe) address: string,
    @Query('tokenId') tokenId?: string,
  ): Promise<DrwaHolderCompliance> {
    const result = await this.drwaService.getDrwaHolderCompliance(address, tokenId);
    if (!result) {
      throw new NotFoundException('Holder compliance record not found');
    }

    return result;
  }

  @Get('/drwa/identity/:address')
  @ApiOperation({ summary: 'DRWA identity compatibility route', description: 'Returns DRWA identity/compliance records for an address' })
  @ApiOkResponse({ type: [DrwaIdentityRecord] })
  async getDrwaIdentity(
    @Param('address', ParseAddressPipe) address: string,
  ): Promise<DrwaIdentityRecord[]> {
    return await this.drwaService.getDrwaIdentity(address);
  }

  @Get('/drwa/assets')
  @ApiOperation({ summary: 'DRWA assets compatibility route', description: 'Returns known DRWA assets' })
  @ApiOkResponse({ type: [DrwaAssetRecord] })
  async listDrwaAssets(): Promise<DrwaAssetRecord[]> {
    return await this.drwaService.listDrwaAssets();
  }

  @Get('/drwa/assets/:identifier')
  @ApiOperation({ summary: 'DRWA asset compatibility route', description: 'Returns the DRWA asset record for a token' })
  @ApiOkResponse({ type: DrwaAssetRecord })
  @ApiNotFoundResponse({ description: 'Asset not found' })
  async getDrwaAsset(
    @Param('identifier', ParseTokenPipe) identifier: string,
  ): Promise<DrwaAssetRecord> {
    const result = await this.drwaService.getDrwaAsset(identifier);
    if (!result) {
      throw new NotFoundException('Asset not found');
    }

    return result;
  }

  @Get('/drwa/denials')
  @ApiOperation({ summary: 'DRWA denials', description: 'Returns paginated DRWA transfer denial history' })
  @ApiOkResponse({ type: [DrwaDenial] })
  @ApiQuery({ name: 'from', description: 'Number of items to skip for the result set', required: false })
  @ApiQuery({ name: 'size', description: 'Number of items to retrieve', required: false })
  @ApiQuery({ name: 'tokenId', description: 'Filter by token identifier', required: false })
  @ApiQuery({ name: 'address', description: 'Filter by sender or receiver address', required: false })
  @ApiQuery({ name: 'denialCode', description: 'Filter by denial code', required: false })
  async getDrwaDenials(
    @Query('from', new DefaultValuePipe(0), ParseIntPipe) from: number,
    @Query('size', new DefaultValuePipe(25), ParseIntPipe) size: number,
    @Query('tokenId') tokenId?: string,
    @Query('address') address?: string,
    @Query('denialCode') denialCode?: string,
  ): Promise<DrwaDenial[]> {
    return await this.drwaService.getDrwaDenials(
      new DrwaDenialFilter({ tokenId, address, denialCode }),
      new QueryPagination({ from, size }),
    );
  }

  @Get('/drwa/attestations/:identifier')
  @ApiOperation({ summary: 'DRWA attestations', description: 'Returns attestation history for a specific token' })
  @ApiOkResponse({ type: [DrwaAttestation] })
  @ApiQuery({ name: 'from', description: 'Number of items to skip for the result set', required: false })
  @ApiQuery({ name: 'size', description: 'Number of items to retrieve', required: false })
  async getDrwaAttestations(
    @Param('identifier', ParseTokenPipe) identifier: string,
    @Query('from', new DefaultValuePipe(0), ParseIntPipe) from: number,
    @Query('size', new DefaultValuePipe(25), ParseIntPipe) size: number,
  ): Promise<DrwaAttestation[]> {
    return await this.drwaService.getDrwaAttestations(
      identifier,
      new QueryPagination({ from, size }),
    );
  }
}
